"use client";
import { FormEvent, useEffect, useState } from "react";
import { BillingLineEditor } from "@/components/BillingLineEditor";
import { listTemplates, updateDraftInvoice } from "@/lib/billing";
import { validateInvoice } from "@/lib/billing-validation";
import { listContactsPage, listServices } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import type { BillingLineInput, Contact, DocumentTemplate, Invoice, Service } from "@/types/db";

export function DraftInvoiceEditor({invoice,onSaved}:{invoice:Invoice;onSaved:()=>Promise<void>}) {
  const [services,setServices]=useState<Service[]>([]),[contacts,setContacts]=useState<Contact[]>([]),[templates,setTemplates]=useState<DocumentTemplate[]>([]);
  const [items,setItems]=useState<BillingLineInput[]>(invoice.items?.map(i=>({...i}))??[]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({contact_id:invoice.contact_id,contract_id:invoice.contract_id??"",template_id:invoice.template_id??"",invoice_date:invoice.invoice_date,due_date:invoice.due_date,service_period_start:invoice.service_period_start??"",service_period_end:invoice.service_period_end??"",currency:invoice.currency,contract_reference:invoice.contract_reference??"",purchase_order_reference:invoice.purchase_order_reference??"",discount:invoice.discount,notes:invoice.notes??"",terms:invoice.terms??"",payment_instructions:invoice.payment_instructions??""});
  useEffect(()=>{const s=createClient();void Promise.all([listServices(s),listContactsPage(s,{page:1,pageSize:100,filter:"customers"}),listTemplates(s)]).then(([serviceRows,contactPage,templateRows])=>{setServices(serviceRows);setContacts(contactPage.rows);setTemplates(templateRows.filter(t=>t.document_type==="invoice"))}).catch(e=>setMessage(e.message))},[]);
  async function save(e:FormEvent){e.preventDefault();const issue=validateInvoice({...form,items});if(issue)return setMessage(issue);setBusy(true);try{await updateDraftInvoice(createClient(),invoice.id,form,items);setMessage("Draft updated.");await onSaved()}catch(err){setMessage(err instanceof Error?err.message:"Draft could not update.")}finally{setBusy(false)}}
  return <section className="surface draft-editor no-print"><div className="section-heading"><div><p className="eyebrow">Editable draft</p><h2>Invoice details and lines</h2></div></div><form onSubmit={save}><div className="form-grid">
    <label className="field span-2"><span>Customer</span><select value={form.contact_id} onChange={e=>setForm({...form,contact_id:e.target.value})}>{contacts.map(c=><option key={c.id} value={c.id}>{c.billing_name||c.name}</option>)}</select></label>
    <label className="field"><span>Template</span><select value={form.template_id} onChange={e=>setForm({...form,template_id:e.target.value})}><option value="">Default template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="field"><span>Currency</span><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>
    <label className="field"><span>Invoice date</span><input type="date" value={form.invoice_date} onChange={e=>setForm({...form,invoice_date:e.target.value})}/></label><label className="field"><span>Due date</span><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
    <label className="field"><span>Period start</span><input type="date" value={form.service_period_start} onChange={e=>setForm({...form,service_period_start:e.target.value})}/></label><label className="field"><span>Period end</span><input type="date" value={form.service_period_end} onChange={e=>setForm({...form,service_period_end:e.target.value})}/></label>
    <label className="field"><span>Contract reference</span><input value={form.contract_reference} onChange={e=>setForm({...form,contract_reference:e.target.value})}/></label><label className="field"><span>PO reference</span><input value={form.purchase_order_reference} onChange={e=>setForm({...form,purchase_order_reference:e.target.value})}/></label>
    <label className="field"><span>Discount</span><input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:Number(e.target.value)})}/></label><label className="field"><span>Notes</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <label className="field span-2"><span>Payment instructions</span><textarea rows={2} value={form.payment_instructions} onChange={e=>setForm({...form,payment_instructions:e.target.value})}/></label><label className="field span-2"><span>Terms</span><textarea rows={2} value={form.terms} onChange={e=>setForm({...form,terms:e.target.value})}/></label>
  </div><BillingLineEditor items={items} services={services} onChange={setItems}/>{message&&<div className="drawer-error">{message}</div>}<button className="button button-secondary" disabled={busy}>Save draft changes</button></form></section>
}
