import assert from "node:assert/strict";
import test from "node:test";
import { validateEntitlementsJson, validateLicensePolicy } from "./licensing-validation.ts";

const valid = {
  contact_id: "contact",
  product_id: "product",
  license_type: "subscription" as const,
  starts_at: "2026-01-01",
  expires_at: "2027-01-01",
  max_activations: 1,
  offline_grace_days: 7,
  validation_hours: 24,
};

test("license policy accepts the recommended subscription defaults", () => {
  assert.equal(validateLicensePolicy(valid), null);
});

test("perpetual licenses do not require expiration", () => {
  assert.equal(validateLicensePolicy({ ...valid, license_type: "perpetual", expires_at: "" }), null);
});

test("license policy rejects invalid dates and capacity", () => {
  assert.match(validateLicensePolicy({ ...valid, expires_at: valid.starts_at }) ?? "", /after/);
  assert.match(validateLicensePolicy({ ...valid, max_activations: 0 }) ?? "", /between 1/);
});

test("entitlements must be a JSON object", () => {
  assert.deepEqual(validateEntitlementsJson("[]").error, "Entitlements must be a JSON object.");
  assert.deepEqual(validateEntitlementsJson('{"reports":true}').value, { reports: true });
});
