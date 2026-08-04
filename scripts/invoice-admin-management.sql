-- ============================================================
-- idevelopit-vault - superadmin invoice editing and deletion
-- Run after billing-foundation.sql and billing-functions.sql.
-- Safe to re-run.
-- ============================================================

create or replace function public.admin_update_invoice(p_invoice_id uuid, p_invoice jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_contact public.contacts%rowtype;
  v_template public.document_templates%rowtype;
  v_item jsonb;
  v_template_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := coalesce((p_invoice->>'discount')::numeric, 0);
  v_total numeric(12,2);
  v_paid numeric(12,2);
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice item';
  end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then
    raise exception 'Due date cannot be before invoice date';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'), '') = '' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric, 0) <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric, -1) < 0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := v_subtotal - v_discount;
  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where invoice_id = p_invoice_id;
  if v_total < v_paid then
    raise exception 'Revised total cannot be below the amount already received (%)', v_paid;
  end if;

  v_template_id := nullif(p_invoice->>'template_id', '')::uuid;
  if v_template_id is null then
    select id into v_template_id from public.document_templates where document_type = 'invoice' and is_default limit 1;
  end if;
  select * into v_contact from public.contacts where id = (p_invoice->>'contact_id')::uuid;
  if not found then raise exception 'Customer not found'; end if;
  select * into v_template from public.document_templates where id = v_template_id;

  update public.invoices set
    contact_id = (p_invoice->>'contact_id')::uuid,
    contract_id = nullif(p_invoice->>'contract_id', '')::uuid,
    template_id = v_template_id,
    invoice_date = (p_invoice->>'invoice_date')::date,
    due_date = (p_invoice->>'due_date')::date,
    service_period_start = nullif(p_invoice->>'service_period_start', '')::date,
    service_period_end = nullif(p_invoice->>'service_period_end', '')::date,
    currency = coalesce(nullif(trim(p_invoice->>'currency'), ''), 'USD'),
    contract_reference = nullif(trim(p_invoice->>'contract_reference'), ''),
    purchase_order_reference = nullif(trim(p_invoice->>'purchase_order_reference'), ''),
    subtotal = v_subtotal,
    discount = v_discount,
    total_amount = v_total,
    notes = nullif(trim(p_invoice->>'notes'), ''),
    terms = nullif(p_invoice->>'terms', ''),
    payment_instructions = nullif(p_invoice->>'payment_instructions', ''),
    client_snapshot = case when v_invoice.finalized_at is not null then
      jsonb_build_object(
        'billingName', coalesce(v_contact.billing_name, v_contact.name),
        'contactName', v_contact.billing_contact,
        'address', v_contact.billing_address,
        'email', v_contact.email,
        'phone', v_contact.whatsapp
      )
      else v_invoice.client_snapshot end,
    template_snapshot = case when v_invoice.finalized_at is not null
      then coalesce(v_template.config, '{}'::jsonb)
      else v_invoice.template_snapshot end,
    status = case
      when v_invoice.status = 'draft' then 'draft'::public.invoice_status
      when v_invoice.status = 'cancelled' then 'cancelled'::public.invoice_status
      when v_paid >= v_total then 'paid'::public.invoice_status
      when v_paid > 0 then 'partially_paid'::public.invoice_status
      when (p_invoice->>'due_date')::date < current_date then 'overdue'::public.invoice_status
      else 'sent'::public.invoice_status
    end
  where id = p_invoice_id;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(
      invoice_id, service_id, description, service_period_start,
      service_period_end, quantity, unit_price, sort_order
    ) values (
      p_invoice_id,
      nullif(v_item->>'service_id', '')::uuid,
      trim(v_item->>'description'),
      nullif(v_item->>'service_period_start', '')::date,
      nullif(v_item->>'service_period_end', '')::date,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'sort_order')::int, 0)
    );
  end loop;
end $$;

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required'; end if;
  delete from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
end $$;

revoke all on function public.admin_update_invoice(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.delete_invoice(uuid) from public,anon;
grant execute on function public.admin_update_invoice(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.delete_invoice(uuid) to authenticated;
