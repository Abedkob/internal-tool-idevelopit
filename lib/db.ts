import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Activity,
  ActivityChannel,
  AppRole,
  Contact,
  ContactIdentity,
  ContactInput,
  ContactStage,
  ContactUpdate,
  Cursor,
  CursorResult,
  DashboardSummary,
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  NavigationCounts,
  NewPaymentInput,
  PagedResult,
  Payment,
  Profile,
  Service,
  Task,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from "@/types/db";
import { cachedBrowserQuery, invalidateBrowserQueries } from "./query-cache.ts";

const contactSummarySelect = `
  id,name,instagram,whatsapp,email,location,billing_name,billing_contact,billing_address,met_at,stage,assigned_to,notes,created_by,created_at,last_touched_at,
  owner:profiles!contacts_assigned_to_fkey(id,name,color)
`;
const taskSelect =
  "*,assignee:profiles!tasks_assigned_to_fkey(id,name,color),items:task_items(*)";
const expenseSelect =
  "*,category:expense_categories(id,name),payer:profiles!expenses_paid_by_fkey(id,name,color)";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function notifyDataChanged() {
  if (typeof window !== "undefined") {
    invalidateBrowserQueries();
    window.dispatchEvent(new Event("idevelopit-vault:data-changed"));
  }
}

function pageBounds(page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = [25, 50, 100].includes(pageSize) ? pageSize : 25;
  return {
    page: safePage,
    pageSize: safeSize,
    from: (safePage - 1) * safeSize,
    to: safePage * safeSize - 1,
  };
}

function paged<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
): PagedResult<T> {
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function normalizeContact(contact: Contact): Contact {
  return {
    ...contact,
    activities: contact.activities ?? [],
    payments: (contact.payments ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
  };
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    items: [...(task.items ?? [])].sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    ),
  };
}

function sanitizeSearch(value: string) {
  return value
    .replace(/[,%_()\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export async function listContactsPage(
  supabase: SupabaseClient,
  options: {
    page: number;
    pageSize: number;
    query?: string;
    filter?: "all" | "leads" | "customers";
  },
): Promise<PagedResult<Contact>> {
  const bounds = pageBounds(options.page, options.pageSize);
  let query = supabase
    .from("contacts")
    .select(contactSummarySelect, { count: "exact" });
  if (options.filter === "leads")
    query = query.in("stage", ["new", "contacted", "replied", "negotiating"]);
  if (options.filter === "customers") query = query.eq("stage", "customer");
  const search = sanitizeSearch(options.query ?? "");
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},instagram.ilike.${pattern},whatsapp.ilike.${pattern},location.ilike.${pattern}`,
    );
  }
  const { data, count, error } = await query
    .order("last_touched_at", { ascending: true })
    .order("id", { ascending: true })
    .range(bounds.from, bounds.to);
  throwIfError(error);
  return paged(
    ((data ?? []) as unknown as Contact[]).map(normalizeContact),
    count ?? 0,
    bounds.page,
    bounds.pageSize,
  );
}

export async function getContact(
  supabase: SupabaseClient,
  id: string,
): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .select(contactSummarySelect)
    .eq("id", id)
    .single();
  throwIfError(error);
  return normalizeContact(data as unknown as Contact);
}

export async function listContactIdentities(
  supabase: SupabaseClient,
): Promise<ContactIdentity[]> {
  const rows: ContactIdentity[] = [];
  const batchSize = 1_000;
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,instagram,whatsapp,email")
      .order("id", { ascending: true })
      .range(from, from + batchSize - 1);
    throwIfError(error);
    const batch = (data ?? []) as ContactIdentity[];
    rows.push(...batch);
    if (batch.length < batchSize) return rows;
  }
}

function applyCursor(query: any, cursor?: Cursor | null) {
  if (!cursor) return query;
  return query.or(
    `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
  );
}

export async function listContactActivities(
  supabase: SupabaseClient,
  contactId: string,
  cursor: Cursor | null = null,
  limit = 20,
): Promise<CursorResult<Activity>> {
  let query = supabase
    .from("activities")
    .select("*,author_profile:profiles!activities_author_fkey(id,name,color)")
    .eq("contact_id", contactId);
  query = applyCursor(query, cursor);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  throwIfError(error);
  const all = (data ?? []) as unknown as Activity[];
  const rows = all.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor:
      all.length > limit && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
  };
}

export async function listContactPayments(
  supabase: SupabaseClient,
  contactId: string,
  cursor: Cursor | null = null,
  limit = 20,
): Promise<CursorResult<Payment>> {
  let query = supabase
    .from("payments")
    .select("*,service:services(id,name,default_price)")
    .eq("contact_id", contactId);
  query = applyCursor(query, cursor);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  throwIfError(error);
  const all = ((data ?? []) as unknown as Payment[]).map((payment) => ({
    ...payment,
    amount: Number(payment.amount),
  }));
  const rows = all.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor:
      all.length > limit && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
  };
}

export async function listPipelineContacts(
  supabase: SupabaseClient,
  limits: Partial<Record<ContactStage, number>>,
): Promise<{
  rows: Record<ContactStage, Contact[]>;
  totals: Record<ContactStage, number>;
}> {
  const stages: ContactStage[] = [
    "new",
    "contacted",
    "replied",
    "negotiating",
    "customer",
    "lost",
  ];
  const results = await Promise.all(
    stages.map(async (stage) => {
      const limit = Math.max(1, Math.min(limits[stage] ?? 40, 200));
      const { data, count, error } = await supabase
        .from("contacts")
        .select(contactSummarySelect, { count: "exact" })
        .eq("stage", stage)
        .order("last_touched_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      throwIfError(error);
      return {
        stage,
        rows: ((data ?? []) as unknown as Contact[]).map(normalizeContact),
        total: count ?? 0,
      };
    }),
  );
  const rows = Object.fromEntries(
    results.map((result) => [result.stage, result.rows]),
  ) as Record<ContactStage, Contact[]>;
  const totals = Object.fromEntries(
    results.map((result) => [result.stage, result.total]),
  ) as Record<ContactStage, number>;
  return { rows, totals };
}

export async function listAttentionContacts(
  supabase: SupabaseClient,
  limit = 5,
): Promise<Contact[]> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("contacts")
    .select(contactSummarySelect)
    .in("stage", ["new", "contacted", "replied", "negotiating"])
    .lt("last_touched_at", cutoff)
    .order("last_touched_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  throwIfError(error);
  return ((data ?? []) as unknown as Contact[]).map(normalizeContact);
}

export async function listProfiles(
  supabase: SupabaseClient,
): Promise<Profile[]> {
  return cachedBrowserQuery("reference:profiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name");
    throwIfError(error);
    return (data ?? []) as Profile[];
  }, 5 * 60_000);
}

export async function listServices(
  supabase: SupabaseClient,
): Promise<Service[]> {
  return cachedBrowserQuery("reference:services", async () => {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .order("name");
    throwIfError(error);
    return (data ?? []).map((service) => ({
      ...service,
      default_price: Number(service.default_price),
      default_quantity: Number(service.default_quantity),
    })) as Service[];
  }, 5 * 60_000);
}

export async function listTasksPage(
  supabase: SupabaseClient,
  options: { page: number; pageSize: number; status?: TaskStatus | "all" },
): Promise<PagedResult<Task>> {
  const bounds = pageBounds(options.page, options.pageSize);
  let query = supabase.from("tasks").select(taskSelect, { count: "exact" });
  if (options.status && options.status !== "all")
    query = query.eq("status", options.status);
  const { data, count, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(bounds.from, bounds.to);
  throwIfError(error);
  return paged(
    ((data ?? []) as unknown as Task[]).map(normalizeTask),
    count ?? 0,
    bounds.page,
    bounds.pageSize,
  );
}

export async function listMyOpenTasks(
  supabase: SupabaseClient,
  limit = 5,
): Promise<Task[]> {
  const userId = await getCurrentUserId(supabase);
  const { data, error } = await supabase
    .from("tasks")
    .select(taskSelect)
    .eq("status", "open")
    .eq("assigned_to", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);
  throwIfError(error);
  return ((data ?? []) as unknown as Task[]).map(normalizeTask);
}

export async function listExpensesPage(
  supabase: SupabaseClient,
  options: { page: number; pageSize: number },
): Promise<PagedResult<Expense>> {
  const bounds = pageBounds(options.page, options.pageSize);
  const { data, count, error } = await supabase
    .from("expenses")
    .select(expenseSelect, { count: "exact" })
    .order("spent_on", { ascending: false })
    .order("id", { ascending: false })
    .range(bounds.from, bounds.to);
  throwIfError(error);
  const rows = ((data ?? []) as unknown as Expense[]).map((expense) => ({
    ...expense,
    amount: Number(expense.amount),
  }));
  return paged(rows, count ?? 0, bounds.page, bounds.pageSize);
}

export async function getNavigationCounts(
  supabase: SupabaseClient,
): Promise<NavigationCounts> {
  return cachedBrowserQuery("summary:navigation", async () => {
    const { data, error } = await supabase.rpc("navigation_counts");
    throwIfError(error);
    return {
      stale_contacts: Number(data?.stale_contacts ?? 0),
      open_tasks: Number(data?.open_tasks ?? 0),
    };
  }, 30_000);
}

export async function getDashboardSummary(
  supabase: SupabaseClient,
): Promise<DashboardSummary> {
  const [summaryResult, billingResult] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase
      .from("invoice_balances")
      .select("amount_paid,balance_due")
      .not("finalized_at", "is", null)
      .neq("status", "cancelled"),
  ]);
  throwIfError(summaryResult.error);
  throwIfError(billingResult.error);
  const data = summaryResult.data;
  const billingRows = billingResult.data ?? [];
  return {
    need_attention: Number(data?.need_attention ?? 0),
    active_pipeline: Number(data?.active_pipeline ?? 0),
    negotiating: Number(data?.negotiating ?? 0),
    collected: billingRows.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0),
    pending: billingRows.reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0),
    spent: Number(data?.spent ?? 0),
    my_open_tasks: Number(data?.my_open_tasks ?? 0),
    pipeline_counts: data?.pipeline_counts ?? {},
    expense_categories: (data?.expense_categories ?? []).map((row: any) => ({
      name: String(row.name),
      total: Number(row.total),
    })),
  };
}

export async function getExpenseSummary(
  supabase: SupabaseClient,
): Promise<ExpenseSummary> {
  const { data, error } = await supabase.rpc("expense_summary");
  throwIfError(error);
  return {
    total: Number(data?.total ?? 0),
    categories: (data?.categories ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      total: Number(row.total),
    })),
    payers: (data?.payers ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      total: Number(row.total),
      entries: Number(row.entries),
    })),
  };
}

export async function getContactPaymentSummary(
  supabase: SupabaseClient,
  contactId: string,
) {
  const { data, error } = await supabase.rpc("contact_payment_summary", {
    p_contact_id: contactId,
  });
  throwIfError(error);
  return {
    collected: Number(data?.collected ?? 0),
    pending: Number(data?.pending ?? 0),
    entries: Number(data?.entries ?? 0),
  };
}

export async function getCurrentUserId(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getClaims();
  throwIfError(error);
  if (!data?.claims?.sub)
    throw new Error("Your session has expired. Sign in again.");
  return data.claims.sub;
}

export async function getCurrentUserRole(
  supabase: SupabaseClient,
): Promise<AppRole> {
  const userId = await getCurrentUserId(supabase);
  const profile = (await listProfiles(supabase)).find((row) => row.id === userId);
  return profile?.app_role === "superadmin" ? "superadmin" : "member";
}

export async function createContact(
  supabase: SupabaseClient,
  input: ContactInput,
): Promise<string> {
  const userId = await getCurrentUserId(supabase);
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...input, created_by: userId })
    .select("id")
    .single();
  throwIfError(error);
  if (!data) throw new Error("Contact was created without a returned record.");
  notifyDataChanged();
  return data.id as string;
}

export async function createContacts(
  supabase: SupabaseClient,
  inputs: ContactInput[],
): Promise<string[]> {
  if (!inputs.length) throw new Error("Choose at least one contact to import.");
  if (inputs.length > 500) throw new Error("Import at most 500 contacts at a time.");
  const userId = await getCurrentUserId(supabase);
  const payload = inputs.map((input) => ({ ...input, created_by: userId }));
  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select("id");
  throwIfError(error);
  if (!data || data.length !== inputs.length)
    throw new Error("The imported contact count could not be verified.");
  notifyDataChanged();
  return data.map((row) => row.id as string);
}

export async function updateContact(
  supabase: SupabaseClient,
  id: string,
  input: ContactUpdate,
) {
  const { error } = await supabase.from("contacts").update(input).eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function moveContact(
  supabase: SupabaseClient,
  contact: Contact,
  stage: ContactStage,
) {
  const userId = await getCurrentUserId(supabase);
  const { error: updateError } = await supabase
    .from("contacts")
    .update({ stage })
    .eq("id", contact.id);
  throwIfError(updateError);
  const { error: activityError } = await supabase.from("activities").insert({
    contact_id: contact.id,
    author: userId,
    channel: null,
    note: `Moved from ${contact.stage} to ${stage}`,
  });
  throwIfError(activityError);
  notifyDataChanged();
}

export async function addActivity(
  supabase: SupabaseClient,
  contactId: string,
  channel: ActivityChannel,
  note: string,
): Promise<Activity> {
  const userId = await getCurrentUserId(supabase);
  const { data, error } = await supabase
    .from("activities")
    .insert({ contact_id: contactId, author: userId, channel, note })
    .select("*")
    .single();
  throwIfError(error);
  notifyDataChanged();
  return data as Activity;
}

export async function addPayment(
  supabase: SupabaseClient,
  input: NewPaymentInput,
): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .insert(input)
    .select("*")
    .single();
  throwIfError(error);
  notifyDataChanged();
  return { ...data, amount: Number(data.amount) } as Payment;
}

export async function createTask(
  supabase: SupabaseClient,
  input: {
    title: string;
    assigned_to: string | null;
    due_date: string | null;
    priority: TaskPriority;
  },
) {
  const userId = await getCurrentUserId(supabase);
  const { error } = await supabase
    .from("tasks")
    .insert({ ...input, created_by: userId, status: "open" });
  throwIfError(error);
  notifyDataChanged();
}

export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  input: Partial<{
    title: string;
    assigned_to: string | null;
    due_date: string | null;
    priority: TaskPriority;
    status: TaskStatus;
  }>,
) {
  const { error } = await supabase.from("tasks").update(input).eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function deleteTask(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function addTaskItem(
  supabase: SupabaseClient,
  taskId: string,
  content: string,
  parentId: string | null,
  sortOrder: number,
) {
  const userId = await getCurrentUserId(supabase);
  const { error } = await supabase.from("task_items").insert({
    task_id: taskId,
    content,
    parent_id: parentId,
    sort_order: sortOrder,
    created_by: userId,
  });
  throwIfError(error);
  notifyDataChanged();
}

export async function updateTaskItem(
  supabase: SupabaseClient,
  id: string,
  input: Partial<Pick<TaskItem, "content" | "done" | "sort_order">>,
) {
  const { error } = await supabase
    .from("task_items")
    .update(input)
    .eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function deleteTaskItem(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("task_items").delete().eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function listExpenseCategories(
  supabase: SupabaseClient,
): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .order("name");
  throwIfError(error);
  return (data ?? []) as ExpenseCategory[];
}

export async function createExpense(
  supabase: SupabaseClient,
  input: {
    amount: number;
    category_id: string;
    description: string | null;
    spent_on: string;
    paid_by: string;
  },
) {
  const userId = await getCurrentUserId(supabase);
  const { error } = await supabase
    .from("expenses")
    .insert({ ...input, created_by: userId });
  throwIfError(error);
  notifyDataChanged();
}

export async function updateExpense(
  supabase: SupabaseClient,
  id: string,
  input: {
    amount: number;
    category_id: string;
    description: string | null;
    spent_on: string;
    paid_by: string;
  },
) {
  const { error } = await supabase.from("expenses").update(input).eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function deleteExpense(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

async function assertUniqueName(
  supabase: SupabaseClient,
  table: "services" | "expense_categories",
  name: string,
  excludeId?: string,
) {
  let query = supabase.from(table).select("id").ilike("name", name.trim());
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1);
  throwIfError(error);
  if (data?.length) throw new Error(`"${name.trim()}" already exists.`);
}

export async function createService(
  supabase: SupabaseClient,
  input: Pick<Service, "name" | "description" | "default_quantity" | "default_price" | "active">,
) {
  await assertUniqueName(supabase, "services", input.name);
  const { error } = await supabase
    .from("services")
    .insert({ ...input, name: input.name.trim() });
  throwIfError(error);
  notifyDataChanged();
}

export async function updateService(
  supabase: SupabaseClient,
  id: string,
  input: Pick<Service, "name" | "description" | "default_quantity" | "default_price" | "active">,
) {
  await assertUniqueName(supabase, "services", input.name, id);
  const { error } = await supabase
    .from("services")
    .update({ ...input, name: input.name.trim() })
    .eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function deleteService(supabase: SupabaseClient, id: string) {
  const usages = await Promise.all(
    ["payments", "contract_items", "invoice_items"].map((table) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("service_id", id),
    ),
  );
  usages.forEach(({ error }) => throwIfError(error));
  if (usages.some(({ count }) => Boolean(count)))
    throw new Error("This service is already in financial history. Mark it inactive instead.");
  const { error } = await supabase.from("services").delete().eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function createExpenseCategory(
  supabase: SupabaseClient,
  name: string,
) {
  await assertUniqueName(supabase, "expense_categories", name);
  const { error } = await supabase
    .from("expense_categories")
    .insert({ name: name.trim() });
  throwIfError(error);
  notifyDataChanged();
}

export async function updateExpenseCategory(
  supabase: SupabaseClient,
  id: string,
  name: string,
) {
  await assertUniqueName(supabase, "expense_categories", name, id);
  const { error } = await supabase
    .from("expense_categories")
    .update({ name: name.trim() })
    .eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}

export async function deleteExpenseCategory(
  supabase: SupabaseClient,
  id: string,
) {
  const { count: categoryCount, error: categoryError } = await supabase
    .from("expense_categories")
    .select("id", { count: "exact", head: true });
  throwIfError(categoryError);
  if ((categoryCount ?? 0) <= 1)
    throw new Error("Keep at least one expense category.");
  const { count, error: countError } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  throwIfError(countError);
  if (count)
    throw new Error(
      "This category is used by an expense and cannot be deleted.",
    );
  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", id);
  throwIfError(error);
  notifyDataChanged();
}
