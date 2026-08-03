-- ============================================================
-- Team Console — Supabase schema
-- Run once in the Supabase SQL editor (or `supabase db` CLI)
-- before using the app.
-- ============================================================

create extension if not exists "pgcrypto";

-- Enums -----------------------------------------------------
create type contact_stage    as enum ('new','contacted','replied','negotiating','customer','lost');
create type activity_channel as enum ('instagram','whatsapp','email','in_person','call','other');
create type payment_status   as enum ('paid','pending');
create type task_priority    as enum ('low','normal','high');
create type task_status      as enum ('open','done');

-- Profiles (one row per team member, linked to auth.users) ---
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#3D5AF1',
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up --------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Services --------------------------------------------------
create table services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  default_price numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- Expense categories (relational, so renames cascade for free)
create table expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Contacts (a "lead"/"target" is just a contact pre-customer) -
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  instagram   text,
  whatsapp    text,
  email       text,
  location    text,
  met_at      timestamptz,
  stage       contact_stage not null default 'new',
  assigned_to uuid references profiles(id) on delete set null,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on contacts (stage);
create index on contacts (assigned_to);

-- Activities (the touchpoint log; drives "last touched"/heat) -
create table activities (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  author     uuid references profiles(id) on delete set null,
  channel    activity_channel,
  note       text not null,
  created_at timestamptz not null default now()
);
create index on activities (contact_id, created_at desc);

-- Payments (a customer contact can have zero, one, or many) ---
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references contacts(id) on delete cascade,
  service_id         uuid references services(id) on delete restrict,
  custom_description text,
  amount             numeric(12,2) not null,
  status             payment_status not null default 'pending',
  paid_on            date,
  created_at         timestamptz not null default now()
);
create index on payments (contact_id);

-- Tasks -----------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  created_by  uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  due_date    date,
  priority    task_priority not null default 'normal',
  status      task_status not null default 'open',
  created_at  timestamptz not null default now()
);

-- Task items (bullets + sub-items, exactly two levels) -------
create table task_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  parent_id  uuid references task_items(id) on delete cascade,
  content    text not null,
  done       boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on task_items (task_id);

-- Expenses --------------------------------------------------
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric(12,2) not null,
  category_id uuid references expense_categories(id) on delete restrict,
  description text,
  spent_on    date not null default current_date,
  paid_by     uuid references profiles(id) on delete set null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on expenses (category_id);

-- Row Level Security ----------------------------------------
-- Internal tool: all 3 members are trusted. Any authenticated
-- user may read/write everything. No anonymous access.
alter table profiles           enable row level security;
alter table services           enable row level security;
alter table expense_categories enable row level security;
alter table contacts           enable row level security;
alter table activities         enable row level security;
alter table payments           enable row level security;
alter table tasks              enable row level security;
alter table task_items         enable row level security;
alter table expenses           enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','services','expense_categories','contacts','activities',
    'payments','tasks','task_items','expenses'
  ] loop
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (true) with check (true);',
      t, t
    );
  end loop;
end$$;
