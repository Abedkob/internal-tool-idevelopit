-- ============================================================
-- Team Console - secure billing operations
-- Run AFTER billing-foundation.sql. Safe to re-run.
-- ============================================================

create or replace function public.save_contract(p_contract jsonb, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if coalesce(trim(p_contract->>'title'), '') = '' then raise exception 'Contract title is required'; end if;
  if p_contract->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null') <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one contract item'; end if;

  if p_id is null then
    insert into public.client_contracts (
      contact_id, contract_number, title, start_date, end_date, billing_day,
      due_days, currency, status, template_id, notes, created_by
    ) values (
      (p_contract->>'contact_id')::uuid, nullif(trim(p_contract->>'contract_number'), ''), trim(p_contract->>'title'),
      (p_contract->>'start_date')::date, nullif(p_contract->>'end_date','')::date,
      coalesce((p_contract->>'billing_day')::int,1), coalesce((p_contract->>'due_days')::int,7),
      coalesce(nullif(trim(p_contract->>'currency'),''),'USD'),
      coalesce((p_contract->>'status')::contract_status,'draft'),
      nullif(p_contract->>'template_id','')::uuid, nullif(trim(p_contract->>'notes'),''), auth.uid()
    ) returning id into v_id;
  else
    update public.client_contracts set
      contact_id=(p_contract->>'contact_id')::uuid,
      contract_number=nullif(trim(p_contract->>'contract_number'),''), title=trim(p_contract->>'title'),
      start_date=(p_contract->>'start_date')::date, end_date=nullif(p_contract->>'end_date','')::date,
      billing_day=coalesce((p_contract->>'billing_day')::int,1), due_days=coalesce((p_contract->>'due_days')::int,7),
      currency=coalesce(nullif(trim(p_contract->>'currency'),''),'USD'), status=(p_contract->>'status')::contract_status,
      template_id=nullif(p_contract->>'template_id','')::uuid, notes=nullif(trim(p_contract->>'notes'),'')
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Contract not found'; end if;
    delete from public.contract_items where contract_id=v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    insert into public.contract_items(contract_id,service_id,description,quantity,unit_price,sort_order)
    values(v_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
  return v_id;
end $$;

create or replace function public.save_document_template(p_template jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_type document_type; v_default boolean;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if coalesce(trim(p_template->>'name'),'')='' then raise exception 'Template name is required'; end if;
  v_type := (p_template->>'document_type')::document_type;
  v_default := coalesce((p_template->>'is_default')::boolean,false);
  if v_default then update public.document_templates set is_default=false where document_type=v_type and id is distinct from p_id; end if;
  if p_id is null then
    insert into public.document_templates(name,document_type,is_default,config,created_by)
    values(trim(p_template->>'name'),v_type,v_default,coalesce(p_template->'config','{}'::jsonb),auth.uid()) returning id into v_id;
  else
    update public.document_templates set name=trim(p_template->>'name'),document_type=v_type,is_default=v_default,config=coalesce(p_template->'config','{}'::jsonb)
    where id=p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.create_invoice(p_invoice jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings app_settings%rowtype; v_id uuid; v_item jsonb; v_subtotal numeric(12,2):=0;
  v_discount numeric(12,2):=coalesce((p_invoice->>'discount')::numeric,0); v_number text; v_template uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one invoice item'; end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then raise exception 'Due date cannot be before invoice date'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;
  if v_discount<0 or v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;

  select * into v_settings from public.app_settings where id=1 for update;
  if not found then raise exception 'Company settings are not configured'; end if;
  v_number := v_settings.invoice_prefix || '-' || lpad(v_settings.next_invoice_number::text,v_settings.invoice_number_padding,'0');
  update public.app_settings set next_invoice_number=next_invoice_number+1,updated_by=auth.uid() where id=1;
  v_template := nullif(p_invoice->>'template_id','')::uuid;
  if v_template is null then select id into v_template from public.document_templates where document_type='invoice' and is_default limit 1; end if;

  insert into public.invoices(
    invoice_number,contact_id,contract_id,template_id,status,invoice_date,due_date,
    service_period_start,service_period_end,currency,contract_reference,purchase_order_reference,
    subtotal,discount,total_amount,notes,terms,payment_instructions,created_by
  ) values (
    v_number,(p_invoice->>'contact_id')::uuid,nullif(p_invoice->>'contract_id','')::uuid,v_template,'draft',
    (p_invoice->>'invoice_date')::date,(p_invoice->>'due_date')::date,
    nullif(p_invoice->>'service_period_start','')::date,nullif(p_invoice->>'service_period_end','')::date,
    coalesce(nullif(trim(p_invoice->>'currency'),''),v_settings.default_currency),
    nullif(trim(p_invoice->>'contract_reference'),''),nullif(trim(p_invoice->>'purchase_order_reference'),''),
    v_subtotal,v_discount,v_subtotal-v_discount,nullif(trim(p_invoice->>'notes'),''),
    coalesce(nullif(p_invoice->>'terms',''),v_settings.default_terms),
    coalesce(nullif(p_invoice->>'payment_instructions',''),v_settings.default_payment_instructions),auth.uid()
  ) returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,service_id,description,service_period_start,service_period_end,quantity,unit_price,sort_order)
    values(v_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),
      nullif(v_item->>'service_period_start','')::date,nullif(v_item->>'service_period_end','')::date,
      (v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
  return v_id;
end $$;

create or replace function public.create_invoice_from_contract(p_contract_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_contract client_contracts%rowtype; v_items jsonb; v_invoice jsonb; v_invoice_date date; v_template uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  select * into v_contract from public.client_contracts where id=p_contract_id and status='active';
  if not found then raise exception 'Active contract not found'; end if;
  if p_period_end<p_period_start then raise exception 'Invalid service period'; end if;
  v_invoice_date := greatest(p_period_start, make_date(extract(year from p_period_start)::int,extract(month from p_period_start)::int,v_contract.billing_day));
  v_template := v_contract.template_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id',service_id,'description',description,'quantity',quantity,'unit_price',unit_price,'sort_order',sort_order,
    'service_period_start',p_period_start,'service_period_end',p_period_end
  ) order by sort_order,id),'[]'::jsonb) into v_items from public.contract_items where contract_id=p_contract_id;
  v_invoice := jsonb_build_object(
    'contact_id',v_contract.contact_id,'contract_id',v_contract.id,'template_id',v_template,
    'invoice_date',v_invoice_date,'due_date',v_invoice_date+v_contract.due_days,
    'service_period_start',p_period_start,'service_period_end',p_period_end,'currency',v_contract.currency,
    'contract_reference',coalesce(v_contract.contract_number,v_contract.title),'discount',0,'notes',v_contract.notes
  );
  return public.create_invoice(v_invoice,v_items);
end $$;

create or replace function public.update_draft_invoice(p_invoice_id uuid, p_invoice jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_item jsonb; v_subtotal numeric(12,2):=0; v_discount numeric(12,2):=coalesce((p_invoice->>'discount')::numeric,0);
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if not exists(select 1 from public.invoices where id=p_invoice_id and status='draft' for update) then raise exception 'Only draft invoices can be edited'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one invoice item'; end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then raise exception 'Due date cannot be before invoice date'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal:=v_subtotal+(v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric;
  end loop;
  if v_discount<0 or v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  update public.invoices set contact_id=(p_invoice->>'contact_id')::uuid,contract_id=nullif(p_invoice->>'contract_id','')::uuid,
    template_id=nullif(p_invoice->>'template_id','')::uuid,invoice_date=(p_invoice->>'invoice_date')::date,due_date=(p_invoice->>'due_date')::date,
    service_period_start=nullif(p_invoice->>'service_period_start','')::date,service_period_end=nullif(p_invoice->>'service_period_end','')::date,
    currency=coalesce(nullif(trim(p_invoice->>'currency'),''),'USD'),contract_reference=nullif(trim(p_invoice->>'contract_reference'),''),
    purchase_order_reference=nullif(trim(p_invoice->>'purchase_order_reference'),''),subtotal=v_subtotal,discount=v_discount,total_amount=v_subtotal-v_discount,
    notes=nullif(trim(p_invoice->>'notes'),''),terms=nullif(p_invoice->>'terms',''),payment_instructions=nullif(p_invoice->>'payment_instructions','')
  where id=p_invoice_id;
  delete from public.invoice_items where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,service_id,description,service_period_start,service_period_end,quantity,unit_price,sort_order)
    values(p_invoice_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),nullif(v_item->>'service_period_start','')::date,
      nullif(v_item->>'service_period_end','')::date,(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
end $$;

create or replace function public.cancel_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if exists(select 1 from public.invoice_payments where invoice_id=p_invoice_id) then raise exception 'An invoice with payments cannot be cancelled'; end if;
  update public.invoices set status='cancelled' where id=p_invoice_id and status<>'paid';
  if not found then raise exception 'Invoice cannot be cancelled'; end if;
end $$;

create or replace function public.sync_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice invoices%rowtype; v_paid numeric(12,2);
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found or v_invoice.status='cancelled' then return; end if;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where invoice_id=p_invoice_id;
  update public.invoices set status=case
    when v_invoice.status='draft' then 'draft'::invoice_status
    when v_paid>=v_invoice.total_amount then 'paid'::invoice_status
    when v_paid>0 then 'partially_paid'::invoice_status
    when v_invoice.due_date<current_date then 'overdue'::invoice_status
    else 'sent'::invoice_status end
  where id=p_invoice_id;
end $$;

create or replace function public.finalize_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice invoices%rowtype; v_settings app_settings%rowtype; v_contact contacts%rowtype; v_template document_templates%rowtype;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status<>'draft' then raise exception 'Only draft invoices can be finalized'; end if;
  select * into v_settings from public.app_settings where id=1;
  select * into v_contact from public.contacts where id=v_invoice.contact_id;
  select * into v_template from public.document_templates where id=v_invoice.template_id;
  update public.invoices set
    company_snapshot=jsonb_build_object('name',v_settings.company_name,'tagline',v_settings.company_tagline,'phone',v_settings.company_phone,'email',v_settings.company_email,'website',v_settings.company_website,'logoUrl',v_settings.logo_url,'stampUrl',v_settings.stamp_url,'footer',v_settings.default_footer,'cashEnabled',v_settings.cash_enabled,'omtEnabled',v_settings.omt_enabled,'omtRecipientName',v_settings.omt_recipient_name,'omtPhone',v_settings.omt_phone,'whishEnabled',v_settings.whish_enabled,'whishRecipientName',v_settings.whish_recipient_name,'whishPhone',v_settings.whish_phone),
    client_snapshot=jsonb_build_object('billingName',coalesce(v_contact.billing_name,v_contact.name),'contactName',v_contact.billing_contact,'address',v_contact.billing_address,'email',v_contact.email,'phone',v_contact.whatsapp),
    template_snapshot=coalesce(v_template.config,'{}'::jsonb),status='sent',finalized_at=now()
  where id=p_invoice_id;
  perform public.sync_invoice_status(p_invoice_id);
end $$;

create or replace function public.refresh_invoice_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  update public.invoices
  set status = 'overdue'
  where status = 'sent' and due_date < current_date
    and total_amount > coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=invoices.id),0);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,p_amount numeric,p_method invoice_payment_method,p_paid_on date,
  p_transaction_reference text default null,p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice invoices%rowtype; v_paid numeric(12,2); v_id uuid;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  if p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status in ('draft','cancelled') then raise exception 'Payments cannot be recorded for this invoice'; end if;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where invoice_id=p_invoice_id;
  if p_amount>v_invoice.total_amount-v_paid then raise exception 'Payment exceeds the remaining balance'; end if;
  insert into public.invoice_payments(invoice_id,amount,payment_method,paid_on,transaction_reference,notes,received_by)
  values(p_invoice_id,p_amount,p_method,coalesce(p_paid_on,current_date),nullif(trim(p_transaction_reference),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  perform public.sync_invoice_status(p_invoice_id);
  return v_id;
end $$;

create or replace function public.generate_monthly_invoices(p_month date default date_trunc('month',current_date)::date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_contract client_contracts%rowtype; v_start date:=date_trunc('month',p_month)::date; v_end date; v_billing date; v_id uuid;
  v_created jsonb:='[]'::jsonb; v_skipped jsonb:='[]'::jsonb; v_errors jsonb:='[]'::jsonb;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  v_end := (v_start+interval '1 month-1 day')::date;
  for v_contract in select * from public.client_contracts where status='active' and start_date<=v_end and (end_date is null or end_date>=v_start) order by id loop
    v_billing := make_date(extract(year from v_start)::int,extract(month from v_start)::int,v_contract.billing_day);
    if v_billing>current_date then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'reason','Not due yet')); continue;
    end if;
    if exists(select 1 from public.invoices where contract_id=v_contract.id and service_period_start=v_start and service_period_end=v_end and status<>'cancelled') then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'reason','Invoice already exists')); continue;
    end if;
    begin
      v_id:=public.create_invoice_from_contract(v_contract.id,v_start,v_end);
      v_created:=v_created||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'invoiceId',v_id));
    exception when others then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('created',v_created,'skipped',v_skipped,'errors',v_errors);
end $$;

revoke all on function public.save_contract(jsonb,jsonb,uuid) from public,anon;
revoke all on function public.save_document_template(jsonb,uuid) from public,anon;
revoke all on function public.create_invoice(jsonb,jsonb) from public,anon;
revoke all on function public.create_invoice_from_contract(uuid,date,date) from public,anon;
revoke all on function public.update_draft_invoice(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.cancel_invoice(uuid) from public,anon;
revoke all on function public.sync_invoice_status(uuid) from public,anon;
revoke all on function public.finalize_invoice(uuid) from public,anon;
revoke all on function public.refresh_invoice_statuses() from public,anon;
revoke all on function public.record_invoice_payment(uuid,numeric,invoice_payment_method,date,text,text) from public,anon;
revoke all on function public.generate_monthly_invoices(date) from public,anon;
grant execute on function public.save_contract(jsonb,jsonb,uuid) to authenticated;
grant execute on function public.save_document_template(jsonb,uuid) to authenticated;
grant execute on function public.create_invoice(jsonb,jsonb) to authenticated;
grant execute on function public.create_invoice_from_contract(uuid,date,date) to authenticated;
grant execute on function public.update_draft_invoice(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.cancel_invoice(uuid) to authenticated;
grant execute on function public.finalize_invoice(uuid) to authenticated;
grant execute on function public.refresh_invoice_statuses() to authenticated;
grant execute on function public.record_invoice_payment(uuid,numeric,invoice_payment_method,date,text,text) to authenticated;
grant execute on function public.generate_monthly_invoices(date) to authenticated;
