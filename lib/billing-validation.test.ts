import assert from "node:assert/strict";
import test from "node:test";
import { calculateTotals, validateContract, validateInvoice } from "./billing-validation.ts";

const items = [
  { service_id: null, description: "Monthly management", quantity: 2, unit_price: 125, sort_order: 0 },
  { service_id: null, description: "Production", quantity: 1.5, unit_price: 100, sort_order: 1 },
];

test("invoice totals use line quantity and price", () => {
  assert.deepEqual(calculateTotals(items, 25), { subtotal: 400, discount: 25, total: 375 });
});

test("invoice rejects invalid dates and excessive discounts", () => {
  assert.match(validateInvoice({ contact_id: "client", invoice_date: "2026-08-10", due_date: "2026-08-09", discount: 0, items })!, /before/);
  assert.match(validateInvoice({ contact_id: "client", invoice_date: "2026-08-10", due_date: "2026-08-11", discount: 401, items })!, /subtotal/);
});

test("contract requires a valid schedule and line", () => {
  assert.match(validateContract({ contact_id: "client", title: "Retainer", start_date: "2026-08-01", billing_day: 29, due_days: 7, items })!, /between 1 and 28/);
  assert.equal(validateContract({ contact_id: "client", title: "Retainer", start_date: "2026-08-01", billing_day: 1, due_days: 7, items }), null);
});
