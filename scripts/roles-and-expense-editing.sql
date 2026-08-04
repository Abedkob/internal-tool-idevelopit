-- ============================================================
-- idevelopit-vault - account roles and protected expense editing
-- Run AFTER schema.sql and performance.sql. Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists app_role text not null default 'member';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_app_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_app_role_check
      check (app_role in ('member', 'superadmin'));
  end if;
end $$;

-- Backfill profiles for Auth users created before the profile trigger existed.
insert into public.profiles (id, name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Team member'
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- This project uses one shared login. Promote the oldest/current account.
update public.profiles
set app_role = 'superadmin'
where id = (select id from auth.users order by created_at asc limit 1);

-- Profiles are an authorization source. Clients may read them, but cannot
-- promote themselves or alter another account's role.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

drop policy if exists expenses_all on public.expenses;
drop policy if exists expenses_read on public.expenses;
drop policy if exists expenses_create on public.expenses;
drop policy if exists expenses_superadmin_update on public.expenses;
drop policy if exists expenses_superadmin_delete on public.expenses;

create policy expenses_read
  on public.expenses
  for select
  to authenticated
  using (true);

create policy expenses_create
  on public.expenses
  for insert
  to authenticated
  with check (true);

create policy expenses_superadmin_update
  on public.expenses
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.app_role = 'superadmin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.app_role = 'superadmin'
    )
  );

create policy expenses_superadmin_delete
  on public.expenses
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.app_role = 'superadmin'
    )
  );

grant select, insert, update, delete on public.expenses to authenticated;
