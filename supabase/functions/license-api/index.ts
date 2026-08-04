import { createClient } from "npm:@supabase/supabase-js@2";
import { publicJwks, signLicenseToken, verifyLicenseToken } from "../_shared/license-token.ts";

const hostedSecretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
const serverSecret =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  hostedSecretKeys.default ??
  Object.values(hostedSecretKeys)[0] ??
  "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  serverSecret,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const messages: Record<string, string> = {
  LICENSE_INVALID: "The license could not be validated.",
  LICENSE_EXPIRED: "The license has expired.",
  LICENSE_SUSPENDED: "The license is suspended.",
  LICENSE_REVOKED: "The license has been revoked.",
  LICENSE_NOT_STARTED: "The license is not active yet.",
  PRODUCT_MISMATCH: "The license is not valid for this product.",
  PRODUCT_DISABLED: "This product is not accepting activations.",
  ACTIVATION_LIMIT_REACHED: "The license has reached its activation limit.",
  INSTALLATION_NOT_FOUND: "The installation is not active.",
  TOKEN_INVALID: "The activation token is invalid or expired.",
  RATE_LIMITED: "Too many requests. Try again later.",
  INVALID_REQUEST: "The request body is invalid.",
};

function cors(req: Request) {
  const configured = (Deno.env.get("LICENSE_ALLOWED_ORIGINS") ?? "*").split(",").map((value) => value.trim());
  const origin = req.headers.get("origin") ?? "";
  const allowed = configured.includes("*") ? "*" : configured.includes(origin) ? origin : configured[0] ?? "";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type, x-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function response(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

function failure(req: Request, code: string, requestId: string, status = 400) {
  return response(req, { ok: false, code, message: messages[code] ?? "The license request failed.", request_id: requestId }, status);
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function body(req: Request) {
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > 16_384) throw new Error("INVALID_REQUEST");
  return await req.json() as Record<string, unknown>;
}

function requiredString(value: unknown, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("INVALID_REQUEST");
  return value.trim();
}

async function rateLimit(req: Request, operation: string, limit: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const bucket = `${operation}:${await hash(ip)}`;
  const { data, error } = await supabase.rpc("license_rate_limit_hit", { p_bucket_key: bucket, p_limit: limit, p_window_seconds: 60 });
  if (error) throw error;
  return Boolean(data);
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("TOKEN_INVALID");
  return value.slice(7);
}

async function tokenResponse(req: Request, result: Record<string, unknown>, requestId: string) {
  if (!result.ok) return failure(req, String(result.code), requestId, 403);
  const signed = await signLicenseToken({
    aud: String(result.product_code),
    sub: String(result.license_id),
    aid: String(result.activation_id),
    tv: Number(result.token_version),
    entitlements: (result.entitlements ?? {}) as Record<string, unknown>,
    validationHours: Number(result.validation_hours),
    offlineGraceDays: Number(result.offline_grace_days),
  });
  return response(req, {
    ok: true,
    code: "LICENSE_ACTIVE",
    request_id: requestId,
    activation_id: result.activation_id,
    product_code: result.product_code,
    license_type: result.license_type,
    expires_at: result.expires_at,
    entitlements: result.entitlements,
    activation_token: signed.token,
    check_after: new Date(signed.claims.check_after * 1000).toISOString(),
    offline_grace_until: new Date(signed.claims.grace_until * 1000).toISOString(),
  });
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const path = new URL(req.url).pathname.replace(/^.*\/license-api/, "").replace(/\/$/, "");
  try {
    if (req.method === "GET" && (path === "/v1/.well-known/jwks.json" || path === "/.well-known/jwks.json")) {
      return response(req, publicJwks());
    }
    if (req.method !== "POST") return failure(req, "INVALID_REQUEST", requestId, 404);

    if (path === "/v1/licenses/activate") {
      if (!await rateLimit(req, "activate", 30)) return failure(req, "RATE_LIMITED", requestId, 429);
      const input = await body(req);
      const installationId = requiredString(input.installation_id, 500);
      const network = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const { data, error } = await supabase.rpc("license_api_activate", {
        p_license_key: requiredString(input.license_key, 200),
        p_product_code: requiredString(input.product_code, 40),
        p_installation_hash: await hash(installationId),
        p_device_label: typeof input.device_label === "string" ? input.device_label.slice(0, 120) : null,
        p_platform: typeof input.platform === "string" ? input.platform.slice(0, 80) : null,
        p_application_version: typeof input.application_version === "string" ? input.application_version.slice(0, 80) : null,
        p_request_id: requestId,
        p_network_hash: await hash(network),
      });
      if (error) throw error;
      return tokenResponse(req, data as Record<string, unknown>, requestId);
    }

    if (path === "/v1/licenses/validate" || path === "/v1/licenses/heartbeat") {
      if (!await rateLimit(req, "validate", 120)) return failure(req, "RATE_LIMITED", requestId, 429);
      const claims = await verifyLicenseToken(bearer(req));
      const input = await body(req);
      const { data, error } = await supabase.rpc("license_api_validate", {
        p_activation_id: claims.aid,
        p_installation_hash: await hash(requiredString(input.installation_id, 500)),
        p_request_id: requestId,
        p_network_hash: await hash(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"),
        p_application_version: typeof input.application_version === "string" ? input.application_version.slice(0, 80) : null,
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      if (result.ok && (String(result.license_id) !== claims.sub || Number(result.token_version) !== claims.tv)) {
        if (String(result.license_id) !== claims.sub) return failure(req, "TOKEN_INVALID", requestId, 401);
      }
      return tokenResponse(req, result, requestId);
    }

    if (path === "/v1/licenses/deactivate") {
      if (!await rateLimit(req, "deactivate", 30)) return failure(req, "RATE_LIMITED", requestId, 429);
      const claims = await verifyLicenseToken(bearer(req));
      const input = await body(req);
      const { data, error } = await supabase.rpc("license_api_deactivate", {
        p_activation_id: claims.aid,
        p_installation_hash: await hash(requiredString(input.installation_id, 500)),
        p_request_id: requestId,
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      return result.ok ? response(req, { ...result, request_id: requestId }) : failure(req, String(result.code), requestId, 404);
    }

    return failure(req, "INVALID_REQUEST", requestId, 404);
  } catch (caught) {
    const code = caught instanceof Error && messages[caught.message] ? caught.message : "INVALID_REQUEST";
    return failure(req, code, requestId, code === "TOKEN_INVALID" ? 401 : 400);
  }
});
