import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IssuedLicense,
  License,
  LicenseActivation,
  LicenseEvent,
  LicensedProduct,
} from "@/types/db";
import { cachedBrowserQuery, invalidateBrowserQueries } from "./query-cache.ts";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function notifyLicensingChanged() {
  if (typeof window === "undefined") return;
  invalidateBrowserQueries();
  window.dispatchEvent(new Event("idevelopit-vault:licensing-changed"));
  window.dispatchEvent(new Event("idevelopit-vault:data-changed"));
}

export async function listLicensedProducts(supabase: SupabaseClient) {
  return cachedBrowserQuery("reference:licensed-products", async () => {
    const { data, error } = await supabase
      .from("licensed_products")
      .select("*")
      .order("active", { ascending: false })
      .order("name");
    fail(error);
    return (data ?? []) as LicensedProduct[];
  }, 5 * 60_000);
}

export async function saveLicensedProduct(
  supabase: SupabaseClient,
  product: Partial<LicensedProduct>,
  id?: string | null,
) {
  const { data, error } = await supabase.rpc("save_licensed_product", {
    p_product: product,
    p_id: id ?? null,
  });
  fail(error);
  notifyLicensingChanged();
  return data as string;
}

export async function listLicenses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("license_registry")
    .select("*")
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((row) => ({
    ...row,
    active_activations: Number(row.active_activations),
    total_activations: Number(row.total_activations),
    max_activations: Number(row.max_activations),
  })) as License[];
}

export async function listContactLicenses(supabase: SupabaseClient, contactId: string) {
  const { data, error } = await supabase
    .from("license_registry")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((row) => ({
    ...row,
    active_activations: Number(row.active_activations),
    total_activations: Number(row.total_activations),
    max_activations: Number(row.max_activations),
  })) as License[];
}

export async function getLicenseDetails(supabase: SupabaseClient, licenseId: string) {
  const [licenseResult, activationResult, eventResult] = await Promise.all([
    supabase.from("license_registry").select("*").eq("id", licenseId).single(),
    supabase.from("license_activations").select("*").eq("license_id", licenseId).order("last_seen_at", { ascending: false }),
    supabase.from("license_events").select("*").eq("license_id", licenseId).order("occurred_at", { ascending: false }).limit(100),
  ]);
  fail(licenseResult.error);
  fail(activationResult.error);
  fail(eventResult.error);
  return {
    ...licenseResult.data,
    active_activations: Number(licenseResult.data.active_activations),
    total_activations: Number(licenseResult.data.total_activations),
    max_activations: Number(licenseResult.data.max_activations),
    activations: (activationResult.data ?? []) as LicenseActivation[],
    events: (eventResult.data ?? []) as LicenseEvent[],
  } as License;
}

export async function issueLicense(supabase: SupabaseClient, license: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("issue_license", { p_license: license });
  fail(error);
  notifyLicensingChanged();
  return data as IssuedLicense;
}

export async function updateLicense(
  supabase: SupabaseClient,
  licenseId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase.rpc("admin_update_license", {
    p_license_id: licenseId,
    p_patch: patch,
  });
  fail(error);
  notifyLicensingChanged();
}

export async function deactivateLicenseActivation(
  supabase: SupabaseClient,
  activationId: string,
  reason = "Removed by superadmin",
) {
  const { error } = await supabase.rpc("admin_deactivate_license_activation", {
    p_activation_id: activationId,
    p_reason: reason,
  });
  fail(error);
  notifyLicensingChanged();
}

export async function resetLicenseActivations(supabase: SupabaseClient, licenseId: string) {
  const { error } = await supabase.rpc("admin_reset_license_activations", {
    p_license_id: licenseId,
  });
  fail(error);
  notifyLicensingChanged();
}

export function maskedLicenseKey(license: Pick<License, "key_prefix" | "key_last_four">) {
  return `${license.key_prefix}-•••••-•••••-${license.key_last_four}`;
}
