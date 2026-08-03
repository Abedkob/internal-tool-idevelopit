-- Read-only post-migration checks. Run after billing-functions.sql.
select to_regclass('public.app_settings') as app_settings,
       to_regclass('public.document_templates') as document_templates,
       to_regclass('public.client_contracts') as client_contracts,
       to_regclass('public.invoices') as invoices,
       to_regclass('public.invoice_payments') as invoice_payments;

select id, company_name, invoice_prefix, next_invoice_number,
       invoice_number_padding, default_currency
from public.app_settings where id = 1;

select document_type, count(*) filter (where is_default) as defaults
from public.document_templates group by document_type;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_invoice','update_draft_invoice','finalize_invoice',
    'record_invoice_payment','generate_monthly_invoices'
  )
order by routine_name;

select bucket_id, count(*) as stored_objects
from storage.objects where bucket_id = 'company-assets' group by bucket_id;
