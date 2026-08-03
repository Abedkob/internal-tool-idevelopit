export type ContactStage =
  | "new"
  | "contacted"
  | "replied"
  | "negotiating"
  | "customer"
  | "lost";
export type ActivityChannel =
  | "instagram"
  | "whatsapp"
  | "email"
  | "in_person"
  | "call"
  | "other";
export type PaymentStatus = "paid" | "pending";
export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "open" | "done";

export type Profile = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Service = {
  id: string;
  name: string;
  default_price: number;
  created_at: string;
};

export type Activity = {
  id: string;
  contact_id: string;
  author: string | null;
  channel: ActivityChannel | null;
  note: string;
  created_at: string;
  author_profile?: Pick<Profile, "id" | "name" | "color"> | null;
};

export type Payment = {
  id: string;
  contact_id: string;
  service_id: string | null;
  custom_description: string | null;
  amount: number;
  status: PaymentStatus;
  paid_on: string | null;
  created_at: string;
  service?: Pick<Service, "id" | "name" | "default_price"> | null;
};

export type Contact = {
  id: string;
  name: string;
  instagram: string | null;
  whatsapp: string | null;
  email: string | null;
  location: string | null;
  met_at: string | null;
  stage: ContactStage;
  assigned_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  last_touched_at: string;
  owner?: Pick<Profile, "id" | "name" | "color"> | null;
  activities?: Activity[];
  payments?: Payment[];
};

export type ContactInput = Pick<
  Contact,
  | "name"
  | "instagram"
  | "whatsapp"
  | "email"
  | "location"
  | "met_at"
  | "stage"
  | "assigned_to"
  | "notes"
>;
export type ContactUpdate = Partial<Omit<ContactInput, "name">> & {
  name?: string;
};

export type NewPaymentInput = {
  contact_id: string;
  service_id: string | null;
  custom_description: string | null;
  amount: number;
  status: PaymentStatus;
  paid_on: string | null;
};

export type TaskItem = {
  id: string;
  task_id: string;
  parent_id: string | null;
  content: string;
  done: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  created_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  assignee?: Pick<Profile, "id" | "name" | "color"> | null;
  items?: TaskItem[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  created_at: string;
};

export type Expense = {
  id: string;
  amount: number;
  category_id: string | null;
  description: string | null;
  spent_on: string;
  paid_by: string | null;
  created_by: string | null;
  created_at: string;
  category?: Pick<ExpenseCategory, "id" | "name"> | null;
  payer?: Pick<Profile, "id" | "name" | "color"> | null;
};

export type PagedResult<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Cursor = { createdAt: string; id: string };
export type CursorResult<T> = { rows: T[]; nextCursor: Cursor | null };

export type NavigationCounts = { stale_contacts: number; open_tasks: number };
export type DashboardSummary = {
  need_attention: number;
  active_pipeline: number;
  negotiating: number;
  collected: number;
  pending: number;
  spent: number;
  my_open_tasks: number;
  pipeline_counts: Partial<Record<ContactStage, number>>;
  expense_categories: { name: string; total: number }[];
};
export type ExpenseSummary = {
  total: number;
  categories: { id: string; name: string; total: number }[];
  payers: {
    id: string;
    name: string;
    color: string;
    total: number;
    entries: number;
  }[];
};
