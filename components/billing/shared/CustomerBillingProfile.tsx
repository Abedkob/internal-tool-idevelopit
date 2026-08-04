"use client";

import { BadgeCheck, Building2, Fingerprint, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
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
  const completeness = filled * 20;
  const set = (key: keyof CustomerBillingValue, next: string) => onChange({ ...value, [key]: next });
  if (!contact) return (
    <aside className="billing-passport billing-passport-empty">
      <span className="passport-empty-mark"><Fingerprint size={25} /></span>
      <div><p className="eyebrow">Billing passport</p><strong>Choose a customer</strong><p>Their saved invoice identity and contact details will load here.</p></div>
    </aside>
  );

  return (
    <aside className="billing-passport">
      <header className="passport-identity">
        <span className="passport-monogram" aria-hidden="true">{(value.billing_name || contact.name).trim().slice(0, 2).toUpperCase()}</span>
        <div className="passport-title">
          <p className="eyebrow"><Fingerprint size={11} /> Customer billing identity</p>
          <h3>{value.billing_name || contact.name}</h3>
          <span>ID · {contact.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <span className="passport-verified" title="Linked customer record"><BadgeCheck size={16} /></span>
      </header>

      <div className="passport-completeness">
        <span><strong>{completeness}% complete</strong><small>{filled} of 5 billing fields</small></span>
        <span className="passport-progress" aria-label={`${completeness}% complete`}><i style={{ width: `${completeness}%` }} /></span>
      </div>

      <div className="passport-fields">
        <label><span className="passport-field-icon"><Building2 size={14}/></span><span><small>Invoice name</small><input value={value.billing_name} onChange={e=>set("billing_name",e.target.value)} placeholder={contact.name}/></span></label>
        <label><span className="passport-field-icon"><UserRound size={14}/></span><span><small>Contact person</small><input value={value.billing_contact} onChange={e=>set("billing_contact",e.target.value)} placeholder="Optional"/></span></label>
        <label className="passport-address-field"><span className="passport-field-icon"><MapPin size={14}/></span><span><small>Billing address</small><textarea rows={2} value={value.billing_address} onChange={e=>set("billing_address",e.target.value)} placeholder="Optional"/></span></label>
        <label><span className="passport-field-icon"><Mail size={14}/></span><span><small>Billing email</small><input type="email" value={value.email} onChange={e=>set("email",e.target.value)} placeholder="Optional"/></span></label>
        <label><span className="passport-field-icon"><Phone size={14}/></span><span><small>WhatsApp</small><input value={value.whatsapp} onChange={e=>set("whatsapp",e.target.value)} placeholder="Optional"/></span></label>
      </div>

      <footer className="passport-sync-note"><ShieldCheck size={13}/><span><strong>Synced customer profile</strong><small>Saving this document updates the customer record.</small></span></footer>
    </aside>
  );
}
