"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { BillingLineInput, Service } from "@/types/db";

export const emptyBillingLine = (order = 0): BillingLineInput => ({ service_id: null, description: "", quantity: 1, unit_price: 0, sort_order: order });

export function BillingLineEditor({ items, services, onChange }: { items: BillingLineInput[]; services: Service[]; onChange: (items: BillingLineInput[]) => void }) {
  function update(index: number, patch: Partial<BillingLineInput>) { onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function choose(index: number, id: string) {
    const service = services.find((entry) => entry.id === id);
    update(index, service ? { service_id: service.id, description: service.description || service.name, quantity: 1, unit_price: service.default_price } : { service_id: null });
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= items.length) return;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((item, sort_order) => ({ ...item, sort_order })));
  }
  return <div className="billing-lines">
    {items.map((item, index) => <div className="billing-line" key={index}>
      <label className="field"><span>Service</span><select value={item.service_id ?? ""} onChange={(e)=>choose(index,e.target.value)}><option value="">Custom item</option>{services.filter((s)=>s.active || s.id===item.service_id).map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <label className="field line-description"><span>Description</span><input value={item.description} onChange={(e)=>update(index,{description:e.target.value})} required/></label>
      <label className="field"><span>Service fee</span><input type="number" min="0" step="0.01" value={item.quantity * item.unit_price} onChange={(e)=>update(index,{quantity:1,unit_price:Number(e.target.value)})}/></label>
      <div className="line-tools"><button type="button" className="icon-button" onClick={()=>move(index,-1)} disabled={index===0} aria-label="Move up"><ArrowUp size={14}/></button><button type="button" className="icon-button" onClick={()=>move(index,1)} disabled={index===items.length-1} aria-label="Move down"><ArrowDown size={14}/></button><button type="button" className="icon-button danger" onClick={()=>onChange(items.filter((_,i)=>i!==index).map((entry,sort_order)=>({...entry,sort_order})))} aria-label="Remove item"><Trash2 size={14}/></button></div>
    </div>)}
    <button type="button" className="button button-secondary" onClick={()=>onChange([...items,emptyBillingLine(items.length)])}><Plus size={15}/> Add line item</button>
  </div>;
}
