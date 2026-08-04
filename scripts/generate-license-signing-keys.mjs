import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });

const keyId = "idv-license-1";
const privateValue = JSON.stringify(privateJwk);
const publicValue = JSON.stringify(publicJwk);

if (process.argv[2] === "--set-secrets") {
  const projectRef = process.argv[3];
  if (!projectRef) {
    console.error("Usage: node scripts/generate-license-signing-keys.mjs --set-secrets PROJECT_REF");
    process.exit(1);
  }
  const cliPath = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
  const result = spawnSync(process.execPath, [
    cliPath,
    "secrets",
    "set",
    `LICENSE_SIGNING_KEY_ID=${keyId}`,
    `LICENSE_SIGNING_PRIVATE_JWK=${privateValue}`,
    `LICENSE_SIGNING_PUBLIC_JWK=${publicValue}`,
    "--project-ref",
    projectRef,
  ], { stdio: "inherit", windowsHide: true });
  if (result.error) {
    console.error("Unable to start the installed Supabase CLI.");
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.log(`LICENSE_SIGNING_KEY_ID=${keyId}`);
console.log(`LICENSE_SIGNING_PRIVATE_JWK='${privateValue}'`);
console.log(`LICENSE_SIGNING_PUBLIC_JWK='${publicValue}'`);
