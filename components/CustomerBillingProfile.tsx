"use client";

import { Building2, CheckCircle2, Mail, MapPin, Phone, UserRound } from "lucide-react";
import type { Contact } from "@/types/db";

export type CustomerBillingValue = {
  billing_name: string;
  billing_contact: string;
  billing_address: string;
  email: string;
  whatsapp: string;
};

type BillingContact = Pick<Contact, "id" | "name" | "billing_name" | "billing_contact" | "billing_address" | "email" | "whatsapp">;

export function customerBillingValue(contact?: BillingContact | null): CustomerBillingValue {
  return {
    billing_name: contact?.billing_name || contact?.name || "",
    billing_contact: contact?.billing_contact || "",
    billing_address: contact?.billing_address || "",
    email: contact?.email || "",
    whatsapp: contact?.whatsapp || "",
  };
}

export function CustomerBillingProfile({ contact, value, onChange }: {
  contact?: BillingContact | null;
  value: CustomerBillingValue;
  onChange: (value: CustomerBillingValue) => void;
}) {
  const filled = Object.values(value).filter((entry) => entry.trim()).length;
  const set = (key: keyof CustomerBillingValue, next: string) => onChange({ ...value, [key]: next });
  if (!contact) return <aside className="billing-passport billing-passport-empty"><Building2 size={24}/><strong>Choose a customer</strong><p>Their saved billing profile will appear here automatically.</p></aside>;
  return <aside className="billing-passport">
    <header><div><p className="eyebrow">Billing passport</p><h3>{value.billing_name || contact.name}</h3></div><span className="passport-score"><CheckCircle2 size={13}/>{filled}/5</span></header>
    <p className="passport-note">Changes made here update the customer record when you save.</p>
    <div className="passport-fields">
      <label><Building2 size={14}/><span><small>Invoice name</small><input value={value.billing_name} onChange={e=>set("billing_name",e.target.value)} placeholder={contact.name}/></span></label>
      <label><UserRound size={14}/><span><small>Contact person</small><input value={value.billing_contact} onChange={e=>set("billing_contact",e.target.value)} placeholder="Optional"/></span></label>
      <label><MapPin size={14}/><span><small>Billing address</small><textarea rows={2} value={value.billing_address} onChange={e=>set("billing_address",e.target.value)} placeholder="Optional"/></span></label>
      <label><Mail size={14}/><span><small>Email</small><input type="email" value={value.email} onChange={e=>set("email",e.target.value)} placeholder="Optional"/></span></label>
      <label><Phone size={14}/><span><small>WhatsApp</small><input value={value.whatsapp} onChange={e=>set("whatsapp",e.target.value)} placeholder="Optional"/></span></label>
    </div>
  </aside>;
}
