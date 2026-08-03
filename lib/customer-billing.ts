import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerBillingValue } from "@/components/CustomerBillingProfile";
import { updateContact } from "@/lib/db";

export async function syncCustomerBilling(supabase: SupabaseClient, contactId: string, value: CustomerBillingValue) {
  await updateContact(supabase, contactId, {
    billing_name: value.billing_name.trim() || null,
    billing_contact: value.billing_contact.trim() || null,
    billing_address: value.billing_address.trim() || null,
    email: value.email.trim() || null,
    whatsapp: value.whatsapp.trim() || null,
  });
}
