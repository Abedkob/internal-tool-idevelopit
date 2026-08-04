-- ============================================================
-- idevelopit-vault — pagination and query-performance migration
-- Run AFTER schema.sql. Safe to re-run.
-- ============================================================

alter table contacts add column if not exists last_touched_at timestamptz;

update contacts c
set last_touched_at = coalesce(
  (select max(a.created_at) from activities a where a.contact_id = c.id),
  c.met_at,
  c.created_at
)
where c.last_touched_at is null;

alter table contacts alter column last_touched_at set default now();
alter table contacts alter column last_touched_at set not null;

create extension if not exists pg_trgm with schema extensions;

create or replace function refresh_contact_last_touched(p_contact_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update contacts c
  set last_touched_at = coalesce(
    (select max(a.created_at) from activities a where a.contact_id = p_contact_id),
    c.met_at,
    c.created_at
  )
  where c.id = p_contact_id;
$$;

create or replace function handle_activity_touch_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_contact_last_touched(old.contact_id);
    return old;
  end if;

  perform refresh_contact_last_touched(new.contact_id);
  if tg_op = 'UPDATE' and old.contact_id is distinct from new.contact_id then
    perform refresh_contact_last_touched(old.contact_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_activity_touch_change on activities;
create trigger on_activity_touch_change
  after insert or update or delete on activities
  for each row execute function handle_activity_touch_change();

create or replace function handle_contact_touch_base()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.last_touched_at := coalesce(
    (select max(a.created_at) from activities a where a.contact_id = new.id),
    new.met_at,
    new.created_at,
    now()
  );
  return new;
end;
$$;

drop trigger if exists on_contact_touch_base on contacts;
create trigger on_contact_touch_base
  before insert or update of met_at on contacts
  for each row execute function handle_contact_touch_base();

create index if not exists contacts_last_touched_idx
  on contacts (last_touched_at asc, id asc);
create index if not exists contacts_active_touch_idx
  on contacts (last_touched_at asc, id asc)
  where stage in ('new','contacted','replied','negotiating');
create index if not exists contacts_name_trgm_idx
  on contacts using gin (name extensions.gin_trgm_ops);
create index if not exists contacts_email_trgm_idx
  on contacts using gin (email extensions.gin_trgm_ops);
create index if not exists contacts_instagram_trgm_idx
  on contacts using gin (instagram extensions.gin_trgm_ops);
create index if not exists contacts_whatsapp_trgm_idx
  on contacts using gin (whatsapp extensions.gin_trgm_ops);
create index if not exists contacts_location_trgm_idx
  on contacts using gin (location extensions.gin_trgm_ops);
create index if not exists activities_contact_cursor_idx
  on activities (contact_id, created_at desc, id desc);
create index if not exists payments_contact_cursor_idx
  on payments (contact_id, created_at desc, id desc);
create index if not exists expenses_spent_on_idx
  on expenses (spent_on desc, id desc);
create index if not exists expenses_paid_by_idx
  on expenses (paid_by);
create index if not exists tasks_status_assignee_due_idx
  on tasks (status, assigned_to, due_date, id);
create index if not exists tasks_status_due_idx
  on tasks (status, due_date asc nulls last, id asc);

create or replace function navigation_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'stale_contacts', (
      select count(*)
      from contacts
      where stage in ('new','contacted','replied','negotiating')
        and last_touched_at < now() - interval '7 days'
    ),
    'open_tasks', (select count(*) from tasks where status = 'open')
  );
$$;

create or replace function dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'need_attention', (
      select count(*) from contacts
      where stage in ('new','contacted','replied','negotiating')
        and last_touched_at < now() - interval '7 days'
    ),
    'active_pipeline', (
      select count(*) from contacts
      where stage in ('new','contacted','replied','negotiating')
    ),
    'negotiating', (select count(*) from contacts where stage = 'negotiating'),
    'collected', (select coalesce(sum(amount), 0) from payments where status = 'paid'),
    'pending', (select coalesce(sum(amount), 0) from payments where status = 'pending'),
    'spent', (select coalesce(sum(amount), 0) from expenses),
    'my_open_tasks', (
      select count(*) from tasks where status = 'open' and assigned_to = auth.uid()
    ),
    'pipeline_counts', (
      select coalesce(jsonb_object_agg(stage, total), '{}'::jsonb)
      from (select stage::text as stage, count(*) as total from contacts group by stage) grouped
    ),
    'expense_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select coalesce(ec.name, 'Uncategorized') as name, sum(e.amount) as total
        from expenses e
        left join expense_categories ec on ec.id = e.category_id
        group by coalesce(ec.name, 'Uncategorized')
      ) grouped
    )
  );
$$;

create or replace function expense_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select coalesce(sum(amount), 0) from expenses),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select ec.id, ec.name, coalesce(sum(e.amount), 0) as total
        from expense_categories ec
        left join expenses e on e.category_id = ec.id
        group by ec.id, ec.name
      ) grouped
    ),
    'payers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'total', total, 'entries', entries) order by total desc), '[]'::jsonb)
      from (
        select p.id, p.name, p.color, coalesce(sum(e.amount), 0) as total, count(e.id) as entries
        from profiles p
        left join expenses e on e.paid_by = p.id
        group by p.id, p.name, p.color
      ) grouped
    )
  );
$$;

create or replace function contact_payment_summary(p_contact_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'collected', coalesce(sum(amount) filter (where status = 'paid'), 0),
    'pending', coalesce(sum(amount) filter (where status = 'pending'), 0),
    'entries', count(*)
  )
  from payments
  where contact_id = p_contact_id;
$$;

revoke all on function navigation_counts() from public, anon;
revoke all on function dashboard_summary() from public, anon;
revoke all on function expense_summary() from public, anon;
revoke all on function contact_payment_summary(uuid) from public, anon;
grant execute on function navigation_counts() to authenticated;
grant execute on function dashboard_summary() to authenticated;
grant execute on function expense_summary() to authenticated;
grant execute on function contact_payment_summary(uuid) to authenticated;
