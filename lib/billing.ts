import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  BillingLineInput,
  ClientContract,
  DocumentTemplate,
  Invoice,
  InvoicePaymentRecord,
  InvoicePaymentMethod,
  PagedResult,
} from "@/types/db";
import { cachedBrowserQuery, invalidateBrowserQueries } from "./query-cache.ts";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function notifyBillingChanged() {
  if (typeof window === "undefined") return;
  invalidateBrowserQueries();
  window.dispatchEvent(new Event("idevelopit-vault:billing-changed"));
  window.dispatchEvent(new Event("idevelopit-vault:data-changed"));
}

const contractSelect = "*,contact:contacts(id,name,billing_name),items:contract_items(*)";
const invoiceSelect = `*,contact:contacts(id,name,billing_name,billing_contact,billing_address,email,whatsapp),
  items:invoice_items(*),invoice_payments(*),template:document_templates(*)`;

function numbers<T extends Record<string, any>>(row: T, keys: string[]): T {
  const copy = { ...row };
  keys.forEach((key) => {
    if (key in copy) copy[key as keyof T] = Number(copy[key]) as T[keyof T];
  });
  return copy;
}

function withEffectiveInvoiceStatus<T extends Invoice>(invoice: T): T {
  const today = new Date().toISOString().slice(0, 10);
  if (
    invoice.balance_due > 0 &&
    invoice.due_date < today &&
    (invoice.status === "sent" || invoice.status === "partially_paid")
  ) {
    return { ...invoice, status: "overdue" };
  }
  return invoice;
}

export async function getAppSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  fail(error);
  return data as AppSettings;
}

export async function saveAppSettings(supabase: SupabaseClient, settings: Partial<AppSettings>) {
  const { id: _id, updated_at: _updated, ...safe } = settings as AppSettings;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  fail(userError);
  const { error } = await supabase.from("app_settings").update({ ...safe, updated_by: user?.id ?? null }).eq("id", 1);
  fail(error);
}

export async function uploadCompanyAsset(supabase: SupabaseClient, kind: "logo" | "stamp", file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Use a PNG, JPEG, or WebP image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be 2 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${kind}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: false });
  fail(error);
  return path;
}

export async function signedAssetUrl(supabase: SupabaseClient, path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data, error } = await supabase.storage.from("company-assets").createSignedUrl(path, 3600);
  fail(error);
  return data?.signedUrl ?? null;
}

export async function listTemplates(supabase: SupabaseClient) {
  return cachedBrowserQuery("reference:templates", async () => {
    const { data, error } = await supabase.from("document_templates").select("*").order("document_type").order("name");
    fail(error);
    return (data ?? []) as DocumentTemplate[];
  }, 5 * 60_000);
}

export async function saveTemplate(supabase: SupabaseClient, template: Partial<DocumentTemplate>, id?: string | null) {
  const { data, error } = await supabase.rpc("save_document_template", { p_template: template, p_id: id ?? null });
  fail(error);
  invalidateBrowserQueries(["reference:templates"]);
  return data as string;
}

export async function deleteTemplate(supabase: SupabaseClient, template: DocumentTemplate) {
  if (template.is_default) throw new Error("Choose another default before deleting this template.");
  const { error } = await supabase.from("document_templates").delete().eq("id", template.id);
  fail(error);
  invalidateBrowserQueries(["reference:templates"]);
}

export async function listContracts(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("client_contracts").select(contractSelect).order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((row: any) => ({ ...row, items: (row.items ?? []).map((item: any) => numbers(item, ["quantity", "unit_price"])) })) as ClientContract[];
}

export async function saveContract(supabase: SupabaseClient, contract: Record<string, unknown>, items: BillingLineInput[], id?: string | null) {
  const { data, error } = await supabase.rpc("save_contract", { p_contract: contract, p_items: items, p_id: id ?? null });
  fail(error);
  return data as string;
}

export async function createInvoice(supabase: SupabaseClient, invoice: Record<string, unknown>, items: BillingLineInput[]) {
  const { data, error } = await supabase.rpc("create_invoice", { p_invoice: invoice, p_items: items });
  fail(error);
  notifyBillingChanged();
  return data as string;
}

export async function updateInvoice(supabase: SupabaseClient, id: string, invoice: Record<string, unknown>, items: BillingLineInput[]) {
  const { error } = await supabase.rpc("admin_update_invoice", { p_invoice_id: id, p_invoice: invoice, p_items: items });
  fail(error);
  notifyBillingChanged();
}

export async function deleteInvoice(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("delete_invoice", { p_invoice_id: id });
  fail(error);
  notifyBillingChanged();
}

export async function cancelInvoice(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("cancel_invoice", { p_invoice_id: id });
  fail(error);
  notifyBillingChanged();
}

export async function createInvoiceFromContract(supabase: SupabaseClient, contractId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("create_invoice_from_contract", { p_contract_id: contractId, p_period_start: start, p_period_end: end });
  fail(error);
  return data as string;
}

export async function generateMonthlyInvoices(supabase: SupabaseClient, month: string) {
  const { data, error } = await supabase.rpc("generate_monthly_invoices", { p_month: month });
  fail(error);
  return data as { created: unknown[]; skipped: unknown[]; errors: unknown[] };
}

export async function listInvoicesPage(
  supabase: SupabaseClient,
  options: { status?: string; page: number; pageSize: number },
): Promise<PagedResult<Invoice>> {
  const page = Math.max(1, Math.floor(options.page) || 1);
  const pageSize = [25, 50, 100].includes(options.pageSize) ? options.pageSize : 25;
  const from = (page - 1) * pageSize;
  const today = new Date().toISOString().slice(0, 10);
  let query = supabase
    .from("invoice_balances")
    .select("*,contact:contacts(id,name,billing_name)", { count: "exact" });
  if (options.status === "overdue") {
    query = query
      .in("status", ["sent", "partially_paid", "overdue"])
      .lt("due_date", today)
      .gt("balance_due", 0);
  } else if (options.status === "sent" || options.status === "partially_paid") {
    query = query.eq("status", options.status).gte("due_date", today);
  } else if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  fail(error);
  const rows = (data ?? []).map((row: any) =>
    withEffectiveInvoiceStatus(
      numbers(row, ["subtotal", "discount", "total_amount", "amount_paid", "balance_due"]) as Invoice,
    ),
  );
  const total = count ?? 0;
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getInvoice(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("invoice_balances").select(invoiceSelect).eq("id", id).single();
  fail(error);
  const invoice = withEffectiveInvoiceStatus(numbers(data as any, ["subtotal", "discount", "total_amount", "amount_paid", "balance_due"]) as Invoice);
  invoice.items = (invoice.items ?? []).map((item: any) => numbers(item, ["quantity", "unit_price", "line_total"])).sort((a: any, b: any) => a.sort_order - b.sort_order);
  invoice.invoice_payments = (invoice.invoice_payments ?? []).map((payment: any) => numbers(payment, ["amount"]));
  return invoice;
}

export async function finalizeInvoice(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("finalize_invoice", { p_invoice_id: id });
  fail(error);
  notifyBillingChanged();
}

export async function recordInvoicePayment(supabase: SupabaseClient, input: {
  invoiceId: string; amount: number; method: InvoicePaymentMethod; paidOn: string;
  transactionReference?: string; notes?: string;
}) {
  const { error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: input.invoiceId, p_amount: input.amount, p_method: input.method,
    p_paid_on: input.paidOn, p_transaction_reference: input.transactionReference || null,
    p_notes: input.notes || null,
  });
  fail(error);
  notifyBillingChanged();
}

export async function listContactInvoiceLedger(supabase: SupabaseClient, contactId: string) {
  const { data, error } = await supabase
    .from("invoice_balances")
    .select("*,invoice_payments(*)")
    .eq("contact_id", contactId)
    .not("finalized_at", "is", null)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []).map((row: any) => withEffectiveInvoiceStatus({
    ...numbers(row, ["subtotal", "discount", "total_amount", "amount_paid", "balance_due"]),
    invoice_payments: (row.invoice_payments ?? []).map((payment: any) => numbers(payment, ["amount"])),
  } as Invoice)) as Invoice[];
}

export async function listInvoicePaymentRecords(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select(`*,invoice:invoices!inner(
      id,invoice_number,contact_id,status,currency,total_amount,
      contact:contacts!inner(id,name,billing_name,email,whatsapp)
    )`)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  fail(error);
  return (data ?? []).map((row: any) => numbers(row, ["amount"])) as InvoicePaymentRecord[];
}

export async function listPaymentInvoices(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("invoice_balances")
    .select("*,contact:contacts(id,name,billing_name,billing_contact,billing_address,email,whatsapp)")
    .order("invoice_date", { ascending: false })
    .limit(500);
  fail(error);
  return (data ?? []).map((row: any) =>
    withEffectiveInvoiceStatus(numbers(row, ["subtotal", "discount", "total_amount", "amount_paid", "balance_due"]) as Invoice),
  ) as Invoice[];
}
