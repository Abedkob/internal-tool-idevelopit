-- Read-only verification after licensing-foundation.sql.
select table_name
from information_schema.tables
where table_schema='public' and table_name in (
  'licensed_products','licenses','license_activations','license_events','license_api_clients','license_rate_limits'
)
order by table_name;

select routine_name
from information_schema.routines
where routine_schema='public' and routine_name like 'license_%'
order by routine_name;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname='public' and tablename like 'license%'
order by tablename, policyname;

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename in ('licenses','license_activations','license_events')
order by tablename,indexname;
