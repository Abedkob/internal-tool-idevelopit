-- ============================================================
-- idevelopit-vault - contact-linked licensing foundation
-- Run AFTER billing-functions.sql. Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.license_type as enum ('trial', 'subscription', 'perpetual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.license_status as enum ('active', 'suspended', 'revoked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.license_event_type as enum (
    'issued', 'updated', 'activated', 'validated', 'deactivated',
    'activation_reset', 'suspended', 'reactivated', 'revoked', 'rejected'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.licensed_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text,
  default_max_activations int not null default 1 check (default_max_activations between 1 and 10000),
  default_offline_grace_days int not null default 7 check (default_offline_grace_days between 0 and 365),
  default_validation_hours int not null default 24 check (default_validation_hours between 1 and 720),
  default_entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(default_entitlements) = 'object'),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  product_id uuid not null references public.licensed_products(id) on delete restrict,
  source_invoice_id uuid references public.invoices(id) on delete set null,
  source_contract_id uuid references public.client_contracts(id) on delete set null,
  key_digest bytea not null unique,
  key_prefix text not null,
  key_last_four text not null,
  license_type public.license_type not null default 'subscription',
  status public.license_status not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_activations int not null default 1 check (max_activations between 1 and 10000),
  offline_grace_days int not null default 7 check (offline_grace_days between 0 and 365),
  validation_hours int not null default 24 check (validation_hours between 1 and 720),
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  internal_notes text,
  token_version int not null default 1 check (token_version > 0),
  issued_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (license_type <> 'perpetual' or expires_at is null),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  installation_hash text not null check (char_length(installation_hash) between 32 and 128),
  device_label text,
  platform text,
  application_version text,
  first_activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.license_events (
  id bigint generated always as identity primary key,
  license_id uuid references public.licenses(id) on delete cascade,
  activation_id uuid references public.license_activations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete restrict,
  event_type public.license_event_type not null,
  result_code text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  request_id text,
  network_hash text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create table if not exists public.license_api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_digest bytea not null unique,
  key_prefix text not null,
  scopes text[] not null default array['licenses:validate']::text[],
  active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.license_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hits int not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists licenses_contact_idx on public.licenses(contact_id, created_at desc);
create index if not exists licenses_product_status_idx on public.licenses(product_id, status, expires_at);
create index if not exists licenses_expiry_idx on public.licenses(expires_at) where status = 'active' and expires_at is not null;
create index if not exists license_activations_license_idx on public.license_activations(license_id, last_seen_at desc);
create unique index if not exists license_active_installation_unique
  on public.license_activations(license_id, installation_hash) where deactivated_at is null;
create index if not exists license_events_license_idx on public.license_events(license_id, occurred_at desc);
create index if not exists license_events_contact_idx on public.license_events(contact_id, occurred_at desc);
create index if not exists license_events_request_idx on public.license_events(request_id) where request_id is not null;

drop trigger if exists licensed_products_touch on public.licensed_products;
create trigger licensed_products_touch before update on public.licensed_products
for each row execute function public.touch_updated_at();
drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
for each row execute function public.touch_updated_at();

create or replace function public.validate_license_commercial_links()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_invoice_id is not null and not exists (
    select 1 from public.invoices where id = new.source_invoice_id and contact_id = new.contact_id
  ) then raise exception 'The source invoice must belong to the selected contact'; end if;
  if new.source_contract_id is not null and not exists (
    select 1 from public.client_contracts where id = new.source_contract_id and contact_id = new.contact_id
  ) then raise exception 'The source contract must belong to the selected contact'; end if;
  return new;
end $$;
drop trigger if exists licenses_validate_commercial_links on public.licenses;
create trigger licenses_validate_commercial_links before insert or update on public.licenses
for each row execute function public.validate_license_commercial_links();

create or replace view public.license_registry
with (security_invoker = true)
as
select
  l.id, l.contact_id, l.product_id, l.source_invoice_id, l.source_contract_id,
  l.key_prefix, l.key_last_four, l.license_type, l.status, l.starts_at, l.expires_at,
  l.max_activations, l.offline_grace_days, l.validation_hours, l.entitlements,
  l.internal_notes, l.token_version, l.issued_by, l.revoked_by, l.revoked_at,
  l.created_at, l.updated_at,
  case
    when l.status = 'revoked' then 'revoked'
    when l.status = 'suspended' then 'suspended'
    when l.starts_at > now() then 'scheduled'
    when l.expires_at is not null and l.expires_at <= now() then 'expired'
    else 'active'
  end as effective_status,
  coalesce(a.active_activations, 0)::int as active_activations,
  coalesce(a.total_activations, 0)::int as total_activations,
  a.last_seen_at,
  row_to_json(c)::jsonb as contact,
  row_to_json(p)::jsonb as product,
  case when i.id is null then null else jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status,
    'currency', i.currency, 'total_amount', i.total_amount,
    'amount_paid', i.amount_paid, 'balance_due', i.balance_due
  ) end as source_invoice
from public.licenses l
join lateral (
  select id, name, billing_name, email, whatsapp from public.contacts where id = l.contact_id
) c on true
join lateral (
  select id, code, name, description, active from public.licensed_products where id = l.product_id
) p on true
left join (
  select license_id,
    count(*) filter (where deactivated_at is null) as active_activations,
    count(*) as total_activations,
    max(last_seen_at) as last_seen_at
  from public.license_activations group by license_id
) a on a.license_id = l.id
left join public.invoice_balances i on i.id = l.source_invoice_id;

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'licensed_products','licenses','license_activations','license_events','license_api_clients','license_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I_superadmin_read on public.%I', table_name, table_name);
    execute format('create policy %I_superadmin_read on public.%I for select to authenticated using (public.is_superadmin())', table_name, table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;
grant select on public.license_registry to authenticated;
grant usage, select on sequence public.license_events_id_seq to service_role;

create or replace function public.save_licensed_product(p_product jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_code text;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  v_code := lower(trim(p_product->>'code'));
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then raise exception 'Product code must use 2-40 lowercase letters, numbers, dashes, or underscores'; end if;
  if coalesce(trim(p_product->>'name'),'') = '' then raise exception 'Product name is required'; end if;
  if p_id is null then
    insert into public.licensed_products(
      code,name,description,default_max_activations,default_offline_grace_days,
      default_validation_hours,default_entitlements,active,created_by
    ) values (
      v_code,trim(p_product->>'name'),nullif(trim(p_product->>'description'),''),
      coalesce((p_product->>'default_max_activations')::int,1),
      coalesce((p_product->>'default_offline_grace_days')::int,7),
      coalesce((p_product->>'default_validation_hours')::int,24),
      coalesce(p_product->'default_entitlements','{}'::jsonb),
      coalesce((p_product->>'active')::boolean,true),auth.uid()
    ) returning id into v_id;
  else
    update public.licensed_products set
      code=v_code,name=trim(p_product->>'name'),description=nullif(trim(p_product->>'description'),''),
      default_max_activations=coalesce((p_product->>'default_max_activations')::int,1),
      default_offline_grace_days=coalesce((p_product->>'default_offline_grace_days')::int,7),
      default_validation_hours=coalesce((p_product->>'default_validation_hours')::int,24),
      default_entitlements=coalesce(p_product->'default_entitlements','{}'::jsonb),
      active=coalesce((p_product->>'active')::boolean,true)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Product not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.issue_license(p_license jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid; v_product public.licensed_products%rowtype; v_random text; v_key text;
  v_contact_id uuid := (p_license->>'contact_id')::uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  select * into v_product from public.licensed_products
  where id=(p_license->>'product_id')::uuid and active;
  if not found then raise exception 'Choose an active product'; end if;
  if not exists(select 1 from public.contacts where id=v_contact_id) then raise exception 'Customer not found'; end if;
  v_random := upper(encode(gen_random_bytes(20),'hex'));
  v_key := 'IDV-' || upper(regexp_replace(v_product.code,'[^a-zA-Z0-9]','','g')) || '-' ||
    substr(v_random,1,5) || '-' || substr(v_random,6,5) || '-' ||
    substr(v_random,11,5) || '-' || substr(v_random,16,5) || '-' ||
    substr(v_random,21,5) || '-' || substr(v_random,26,5) || '-' ||
    substr(v_random,31,5) || '-' || substr(v_random,36,5);
  insert into public.licenses(
    contact_id,product_id,source_invoice_id,source_contract_id,key_digest,key_prefix,key_last_four,
    license_type,status,starts_at,expires_at,max_activations,offline_grace_days,
    validation_hours,entitlements,internal_notes,issued_by
  ) values (
    v_contact_id,v_product.id,nullif(p_license->>'source_invoice_id','')::uuid,
    nullif(p_license->>'source_contract_id','')::uuid,digest(v_key,'sha256'),
    split_part(v_key,'-',1)||'-'||split_part(v_key,'-',2),right(v_key,4),
    coalesce((p_license->>'license_type')::public.license_type,'subscription'),'active',
    coalesce(nullif(p_license->>'starts_at','')::timestamptz,now()),
    case when coalesce(p_license->>'license_type','subscription')='perpetual' then null
      else (nullif(p_license->>'expires_at','')::date + 1)::timestamptz - interval '1 second' end,
    coalesce((p_license->>'max_activations')::int,v_product.default_max_activations),
    coalesce((p_license->>'offline_grace_days')::int,v_product.default_offline_grace_days),
    coalesce((p_license->>'validation_hours')::int,v_product.default_validation_hours),
    coalesce(p_license->'entitlements','{}'::jsonb),nullif(trim(p_license->>'internal_notes'),''),auth.uid()
  ) returning id into v_id;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id,metadata)
  values(v_id,v_contact_id,'issued','LICENSE_ISSUED',auth.uid(),jsonb_build_object('product_id',v_product.id));
  return jsonb_build_object('license_id',v_id,'license_key',v_key);
end $$;

create or replace function public.admin_update_license(p_license_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_before public.licenses%rowtype; v_after public.licenses%rowtype; v_event public.license_event_type := 'updated';
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  select * into v_before from public.licenses where id=p_license_id for update;
  if not found then raise exception 'License not found'; end if;
  update public.licenses set
    status=coalesce((p_patch->>'status')::public.license_status,status),
    starts_at=coalesce(nullif(p_patch->>'starts_at','')::timestamptz,starts_at),
    expires_at=case when license_type='perpetual' then null when p_patch ? 'expires_at' then
      case when nullif(p_patch->>'expires_at','') is null then null
        else (nullif(p_patch->>'expires_at','')::date + 1)::timestamptz - interval '1 second' end
      else expires_at end,
    max_activations=coalesce((p_patch->>'max_activations')::int,max_activations),
    offline_grace_days=coalesce((p_patch->>'offline_grace_days')::int,offline_grace_days),
    validation_hours=coalesce((p_patch->>'validation_hours')::int,validation_hours),
    entitlements=coalesce(p_patch->'entitlements',entitlements),
    internal_notes=case when p_patch ? 'internal_notes' then nullif(trim(p_patch->>'internal_notes'),'') else internal_notes end,
    revoked_at=case when coalesce(p_patch->>'status',status::text)='revoked' then coalesce(revoked_at,now()) else null end,
    revoked_by=case when coalesce(p_patch->>'status',status::text)='revoked' then coalesce(revoked_by,auth.uid()) else null end,
    token_version=case when p_patch ? 'status' or p_patch ? 'max_activations' or p_patch ? 'expires_at' then token_version+1 else token_version end
  where id=p_license_id returning * into v_after;
  v_event := case
    when v_after.status='revoked' and v_before.status<>'revoked' then 'revoked'
    when v_after.status='suspended' and v_before.status<>'suspended' then 'suspended'
    when v_after.status='active' and v_before.status='suspended' then 'reactivated'
    else 'updated' end;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id,metadata)
  values(v_after.id,v_after.contact_id,v_event,'LICENSE_'||upper(v_event::text),auth.uid(),p_patch);
end $$;

create or replace function public.admin_deactivate_license_activation(p_activation_id uuid, p_reason text default 'Removed by superadmin')
returns void language plpgsql security definer set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_contact uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  update public.license_activations set deactivated_at=coalesce(deactivated_at,now()),deactivated_reason=p_reason
  where id=p_activation_id returning * into v_activation;
  if not found then raise exception 'Activation not found'; end if;
  update public.licenses set token_version=token_version+1 where id=v_activation.license_id returning contact_id into v_contact;
  insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,actor_id)
  values(v_activation.license_id,v_activation.id,v_contact,'deactivated','ACTIVATION_DEACTIVATED',auth.uid());
end $$;

create or replace function public.admin_reset_license_activations(p_license_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  update public.license_activations set deactivated_at=coalesce(deactivated_at,now()),deactivated_reason='Reset by superadmin'
  where license_id=p_license_id and deactivated_at is null;
  update public.licenses set token_version=token_version+1 where id=p_license_id returning contact_id into v_contact;
  if v_contact is null then raise exception 'License not found'; end if;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id)
  values(p_license_id,v_contact,'activation_reset','ACTIVATIONS_RESET',auth.uid());
end $$;

revoke all on function public.save_licensed_product(jsonb,uuid) from public,anon;
revoke all on function public.issue_license(jsonb) from public,anon;
revoke all on function public.admin_update_license(uuid,jsonb) from public,anon;
revoke all on function public.admin_deactivate_license_activation(uuid,text) from public,anon;
revoke all on function public.admin_reset_license_activations(uuid) from public,anon;
grant execute on function public.save_licensed_product(jsonb,uuid) to authenticated;
grant execute on function public.issue_license(jsonb) to authenticated;
grant execute on function public.admin_update_license(uuid,jsonb) to authenticated;
grant execute on function public.admin_deactivate_license_activation(uuid,text) to authenticated;
grant execute on function public.admin_reset_license_activations(uuid) to authenticated;

create or replace function public.license_api_activate(
  p_license_key text, p_product_code text, p_installation_hash text,
  p_device_label text default null, p_platform text default null,
  p_application_version text default null, p_request_id text default null,
  p_network_hash text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_license public.licenses%rowtype; v_product public.licensed_products%rowtype;
  v_activation public.license_activations%rowtype; v_count int; v_code text;
begin
  select l.* into v_license from public.licenses l
  where l.key_digest=digest(upper(trim(p_license_key)),'sha256') for update;
  if not found then return jsonb_build_object('ok',false,'code','LICENSE_INVALID'); end if;
  select * into v_product from public.licensed_products where id=v_license.product_id;
  v_code := case
    when not v_product.active or lower(v_product.code)<>lower(trim(p_product_code)) then 'PRODUCT_MISMATCH'
    when v_license.status='revoked' then 'LICENSE_REVOKED'
    when v_license.status='suspended' then 'LICENSE_SUSPENDED'
    when v_license.starts_at>now() then 'LICENSE_NOT_STARTED'
    when v_license.expires_at is not null and v_license.expires_at<=now() then 'LICENSE_EXPIRED'
    else null end;
  if v_code is not null then
    insert into public.license_events(license_id,contact_id,event_type,result_code,request_id,network_hash)
    values(v_license.id,v_license.contact_id,'rejected',v_code,p_request_id,p_network_hash);
    return jsonb_build_object('ok',false,'code',v_code);
  end if;
  select * into v_activation from public.license_activations
  where license_id=v_license.id and installation_hash=p_installation_hash and deactivated_at is null for update;
  if not found then
    select count(*) into v_count from public.license_activations where license_id=v_license.id and deactivated_at is null;
    if v_count>=v_license.max_activations then
      insert into public.license_events(license_id,contact_id,event_type,result_code,request_id,network_hash)
      values(v_license.id,v_license.contact_id,'rejected','ACTIVATION_LIMIT_REACHED',p_request_id,p_network_hash);
      return jsonb_build_object('ok',false,'code','ACTIVATION_LIMIT_REACHED');
    end if;
    insert into public.license_activations(license_id,installation_hash,device_label,platform,application_version)
    values(v_license.id,p_installation_hash,nullif(trim(p_device_label),''),nullif(trim(p_platform),''),nullif(trim(p_application_version),''))
    returning * into v_activation;
    insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id,network_hash,metadata)
    values(v_license.id,v_activation.id,v_license.contact_id,'activated','LICENSE_ACTIVATED',p_request_id,p_network_hash,
      jsonb_build_object('platform',p_platform,'application_version',p_application_version));
  else
    update public.license_activations set last_seen_at=now(),device_label=coalesce(nullif(trim(p_device_label),''),device_label),
      platform=coalesce(nullif(trim(p_platform),''),platform),application_version=coalesce(nullif(trim(p_application_version),''),application_version)
    where id=v_activation.id returning * into v_activation;
  end if;
  return jsonb_build_object(
    'ok',true,'code','LICENSE_ACTIVE','license_id',v_license.id,'activation_id',v_activation.id,
    'product_code',v_product.code,'license_type',v_license.license_type,'expires_at',v_license.expires_at,
    'validation_hours',v_license.validation_hours,'offline_grace_days',v_license.offline_grace_days,
    'token_version',v_license.token_version,'entitlements',v_product.default_entitlements||v_license.entitlements
  );
end $$;

create or replace function public.license_api_validate(
  p_activation_id uuid, p_installation_hash text, p_request_id text default null,
  p_network_hash text default null, p_application_version text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_license public.licenses%rowtype; v_product public.licensed_products%rowtype; v_code text;
begin
  select * into v_activation from public.license_activations
  where id=p_activation_id and installation_hash=p_installation_hash and deactivated_at is null for update;
  if not found then return jsonb_build_object('ok',false,'code','INSTALLATION_NOT_FOUND'); end if;
  select * into v_license from public.licenses where id=v_activation.license_id;
  select * into v_product from public.licensed_products where id=v_license.product_id;
  v_code := case
    when v_license.status='revoked' then 'LICENSE_REVOKED'
    when v_license.status='suspended' then 'LICENSE_SUSPENDED'
    when v_license.starts_at>now() then 'LICENSE_NOT_STARTED'
    when v_license.expires_at is not null and v_license.expires_at<=now() then 'LICENSE_EXPIRED'
    when not v_product.active then 'PRODUCT_DISABLED'
    else null end;
  if v_code is not null then
    insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id,network_hash)
    values(v_license.id,v_activation.id,v_license.contact_id,'rejected',v_code,p_request_id,p_network_hash);
    return jsonb_build_object('ok',false,'code',v_code,'token_version',v_license.token_version);
  end if;
  update public.license_activations set last_seen_at=now(),application_version=coalesce(nullif(trim(p_application_version),''),application_version)
  where id=v_activation.id;
  return jsonb_build_object(
    'ok',true,'code','LICENSE_ACTIVE','license_id',v_license.id,'activation_id',v_activation.id,
    'product_code',v_product.code,'license_type',v_license.license_type,'expires_at',v_license.expires_at,
    'validation_hours',v_license.validation_hours,'offline_grace_days',v_license.offline_grace_days,
    'token_version',v_license.token_version,'entitlements',v_product.default_entitlements||v_license.entitlements
  );
end $$;

create or replace function public.license_api_deactivate(p_activation_id uuid, p_installation_hash text, p_request_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_contact uuid;
begin
  update public.license_activations set deactivated_at=now(),deactivated_reason='Deactivated by application'
  where id=p_activation_id and installation_hash=p_installation_hash and deactivated_at is null returning * into v_activation;
  if not found then return jsonb_build_object('ok',false,'code','INSTALLATION_NOT_FOUND'); end if;
  update public.licenses set token_version=token_version+1 where id=v_activation.license_id returning contact_id into v_contact;
  insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id)
  values(v_activation.license_id,v_activation.id,v_contact,'deactivated','ACTIVATION_DEACTIVATED',p_request_id);
  return jsonb_build_object('ok',true,'code','ACTIVATION_DEACTIVATED');
end $$;

create or replace function public.license_rate_limit_hit(p_bucket_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into public.license_rate_limits(bucket_key,window_started_at,hits,updated_at)
  values(p_bucket_key,now(),1,now())
  on conflict(bucket_key) do update set
    hits=case when license_rate_limits.window_started_at < now()-(p_window_seconds||' seconds')::interval then 1 else license_rate_limits.hits+1 end,
    window_started_at=case when license_rate_limits.window_started_at < now()-(p_window_seconds||' seconds')::interval then now() else license_rate_limits.window_started_at end,
    updated_at=now()
  returning hits into v_hits;
  return v_hits<=p_limit;
end $$;

revoke all on function public.license_api_activate(text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.license_api_validate(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.license_api_deactivate(uuid,text,text) from public,anon,authenticated;
revoke all on function public.license_rate_limit_hit(text,int,int) from public,anon,authenticated;
grant execute on function public.license_api_activate(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.license_api_validate(uuid,text,text,text,text) to service_role;
grant execute on function public.license_api_deactivate(uuid,text,text) to service_role;
grant execute on function public.license_rate_limit_hit(text,int,int) to service_role;

comment on table public.licenses is 'Contact-owned product licenses. Plaintext keys are never stored.';
comment on table public.license_events is 'Append-only audit trail for license management and external lifecycle decisions.';
