import type { BillingLineInput } from "@/types/db";

export function calculateTotals(items: BillingLineInput[], discount = 0) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
    0,
  );
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount),
    total: Number((subtotal - Number(discount)).toFixed(2)),
  };
}

export function validateLines(items: BillingLineInput[]) {
  if (!items.length) return "Add at least one item.";
  for (const item of items) {
    if (!item.description.trim()) return "Every item needs a description.";
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)
      return "Every quantity must be greater than zero.";
    if (!Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0)
      return "Prices cannot be negative.";
  }
  return null;
}

export function validateInvoice(input: {
  contact_id: string;
  invoice_date: string;
  due_date: string;
  discount: number;
  items: BillingLineInput[];
}) {
  if (!input.contact_id) return "Choose a customer.";
  if (!input.invoice_date || !input.due_date) return "Invoice and due dates are required.";
  if (input.due_date < input.invoice_date)
    return "Due date cannot be before the invoice date.";
  const lineError = validateLines(input.items);
  if (lineError) return lineError;
  const { subtotal } = calculateTotals(input.items);
  if (input.discount < 0 || input.discount > subtotal)
    return "Discount cannot exceed the subtotal.";
  return null;
}

export function validateContract(input: {
  contact_id: string;
  title: string;
  start_date: string;
  billing_day: number;
  due_days: number;
  items: BillingLineInput[];
}) {
  if (!input.contact_id) return "Choose a customer.";
  if (!input.title.trim()) return "Contract title is required.";
  if (!input.start_date) return "Start date is required.";
  if (input.billing_day < 1 || input.billing_day > 28)
    return "Billing day must be between 1 and 28.";
  if (input.due_days < 0) return "Due days cannot be negative.";
  return validateLines(input.items);
}

