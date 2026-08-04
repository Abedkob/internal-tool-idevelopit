-- ============================================================
-- idevelopit-vault - billing foundation
-- Run AFTER roles-and-expense-editing.sql. Safe to re-run.
-- The legacy public.payments table is intentionally untouched.
-- ============================================================

alter table public.contacts
  add column if not exists billing_name text,
  add column if not exists billing_contact text,
  add column if not exists billing_address text;

alter table public.services
  add column if not exists description text,
  add column if not exists default_quantity numeric(12,2) not null default 1,
  add column if not exists active boolean not null default true;

do $$ begin
  create type public.document_type as enum ('invoice', 'contract', 'receipt');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.contract_status as enum ('draft', 'active', 'paused', 'ended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_payment_method as enum ('cash', 'omt', 'whish');
exception when duplicate_object then null; end $$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and app_role = 'superadmin'
  );
$$;
revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null,
  company_tagline text,
  company_phone text,
  company_email text,
  company_website text,
  logo_url text,
  stamp_url text,
  invoice_prefix text not null default 'INV',
  next_invoice_number bigint not null default 1 check (next_invoice_number > 0),
  invoice_number_padding int not null default 4 check (invoice_number_padding between 1 and 12),
  default_currency text not null default 'USD',
  default_due_days int not null default 7 check (default_due_days >= 0),
  default_terms text,
  default_footer text not null default 'Thank you for your business.',
  default_payment_instructions text,
  cash_enabled boolean not null default true,
  omt_enabled boolean not null default true,
  omt_recipient_name text,
  omt_phone text,
  whish_enabled boolean not null default true,
  whish_recipient_name text,
  whish_phone text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, company_name)
values (1, 'idevelopit-vault')
on conflict (id) do nothing;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type public.document_type not null,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_default_template_per_type
  on public.document_templates (document_type) where is_default = true;

insert into public.document_templates (name, document_type, is_default, config)
select 'Classic invoice', 'invoice', true, $$
{
  "paperSize":"A4","orientation":"portrait","primaryColor":"#20242f",
  "fontFamily":"Arial","logoWidth":160,"stampWidth":130,
  "sections":["header","billTo","billingDetails","items","totals","paymentInstructions","terms","stamp"],
  "visibility":{"companyPhone":true,"companyEmail":true,"companyWebsite":true,"clientAddress":true,"clientEmail":true,"clientPhone":true,"contractReference":true,"purchaseOrderReference":true,"discount":true,"previousBalance":false},
  "labels":{"invoiceTitle":"INVOICE","billTo":"BILL TO","services":"SERVICES PROVIDED","totalDue":"TOTAL DUE"}
}
$$::jsonb
where not exists (
  select 1 from public.document_templates where document_type = 'invoice' and is_default
);

create table if not exists public.client_contracts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  contract_number text unique,
  title text not null,
  start_date date not null,
  end_date date,
  billing_day int not null default 1 check (billing_day between 1 and 28),
  due_days int not null default 7 check (due_days >= 0),
  currency text not null default 'USD',
  status public.contract_status not null default 'draft',
  template_id uuid references public.document_templates(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists client_contracts_contact_idx on public.client_contracts(contact_id);
create index if not exists client_contracts_billing_idx on public.client_contracts(status, billing_day, start_date, end_date);

create table if not exists public.contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.client_contracts(id) on delete cascade,
  service_id uuid references public.services(id) on delete restrict,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists contract_items_contract_idx on public.contract_items(contract_id, sort_order, id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  contract_id uuid references public.client_contracts(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  status public.invoice_status not null default 'draft',
  invoice_date date not null default current_date,
  due_date date not null,
  service_period_start date,
  service_period_end date,
  currency text not null default 'USD',
  contract_reference text,
  purchase_order_reference text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  terms text,
  payment_instructions text,
  company_snapshot jsonb not null default '{}'::jsonb,
  client_snapshot jsonb not null default '{}'::jsonb,
  template_snapshot jsonb not null default '{}'::jsonb,
  pdf_url text,
  finalized_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= invoice_date),
  check (service_period_end is null or service_period_start is null or service_period_end >= service_period_start),
  check (discount <= subtotal)
);
create index if not exists invoices_contact_date_idx on public.invoices(contact_id, invoice_date desc, id desc);
create index if not exists invoices_status_due_idx on public.invoices(status, due_date, id);
create unique index if not exists invoices_contract_period_unique
  on public.invoices(contract_id, service_period_start, service_period_end)
  where contract_id is not null and status <> 'cancelled';

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete restrict,
  description text not null,
  service_period_start date,
  service_period_end date,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (service_period_end is null or service_period_start is null or service_period_end >= service_period_start)
);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id, sort_order, id);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.invoice_payment_method not null,
  paid_on date not null default current_date,
  transaction_reference text,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx on public.invoice_payments(invoice_id, paid_on desc, id desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
for each row execute function public.touch_updated_at();
drop trigger if exists document_templates_touch on public.document_templates;
create trigger document_templates_touch before update on public.document_templates
for each row execute function public.touch_updated_at();
drop trigger if exists client_contracts_touch on public.client_contracts;
create trigger client_contracts_touch before update on public.client_contracts
for each row execute function public.touch_updated_at();
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
for each row execute function public.touch_updated_at();

create or replace view public.invoice_balances
with (security_invoker = true)
as
select i.*,
  coalesce(p.amount_paid, 0)::numeric(12,2) as amount_paid,
  greatest(i.total_amount - coalesce(p.amount_paid, 0), 0)::numeric(12,2) as balance_due
from public.invoices i
left join (
  select invoice_id, sum(amount) as amount_paid
  from public.invoice_payments group by invoice_id
) p on p.invoice_id = i.id;

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'app_settings','document_templates','client_contracts','contract_items',
    'invoices','invoice_items','invoice_payments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I_read on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_write on public.%I', table_name, table_name);
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', table_name, table_name);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin())', table_name, table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;
grant select on public.invoice_balances to authenticated;

-- Sensitive billing rows are mutated only through the security-definer RPCs in
-- billing-functions.sql. This prevents browser clients from supplying totals,
-- snapshots, numbering, payment receivers, or contract item replacements.
do $$ declare table_name text;
begin
  foreach table_name in array array[
    'client_contracts','contract_items','invoices','invoice_items','invoice_payments'
  ] loop
    execute format('drop policy if exists %I_write on public.%I', table_name, table_name);
    execute format('revoke insert, update, delete on public.%I from authenticated', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_read on storage.objects;
drop policy if exists company_assets_insert on storage.objects;
drop policy if exists company_assets_update on storage.objects;
drop policy if exists company_assets_delete on storage.objects;
create policy company_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'company-assets');
create policy company_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and public.is_superadmin());
create policy company_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and public.is_superadmin())
  with check (bucket_id = 'company-assets' and public.is_superadmin());
create policy company_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and public.is_superadmin());

comment on table public.payments is
  'Legacy contact-level expected/received payment ledger. Preserved; new invoice receipts use invoice_payments.';
