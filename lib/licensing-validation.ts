import type { LicenseType } from "@/types/db";

export type LicensePolicyInput = {
  contact_id: string;
  product_id: string;
  license_type: LicenseType;
  starts_at: string;
  expires_at: string;
  max_activations: number;
  offline_grace_days: number;
  validation_hours: number;
};

export function validateLicensePolicy(input: LicensePolicyInput) {
  if (!input.contact_id) return "Choose a customer.";
  if (!input.product_id) return "Choose a licensed product.";
  if (!input.starts_at || Number.isNaN(Date.parse(`${input.starts_at}T00:00:00Z`))) return "Choose a valid start date.";
  if (input.license_type !== "perpetual") {
    if (!input.expires_at || Number.isNaN(Date.parse(`${input.expires_at}T00:00:00Z`))) return "Choose a valid expiration date.";
    if (input.expires_at <= input.starts_at) return "Expiration must be after the start date.";
  }
  if (!Number.isInteger(input.max_activations) || input.max_activations < 1 || input.max_activations > 10_000) return "Activation limit must be between 1 and 10,000.";
  if (!Number.isInteger(input.offline_grace_days) || input.offline_grace_days < 0 || input.offline_grace_days > 365) return "Offline grace must be between 0 and 365 days.";
  if (!Number.isInteger(input.validation_hours) || input.validation_hours < 1 || input.validation_hours > 720) return "Validation interval must be between 1 and 720 hours.";
  return null;
}

export function validateEntitlementsJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return { value: null, error: "Entitlements must be a JSON object." };
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: "Entitlements contain invalid JSON." };
  }
}
