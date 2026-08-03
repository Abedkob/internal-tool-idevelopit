import type { Contact } from "@/types/db";

export type HeatLevel = "fresh" | "watch" | "warm" | "hot";

const DAY_MS = 86_400_000;

export function latestTouch(
  contact: Pick<
    Contact,
    "last_touched_at" | "activities" | "met_at" | "created_at"
  >,
) {
  return (
    contact.last_touched_at ??
    contact.activities?.[0]?.created_at ??
    contact.met_at ??
    contact.created_at
  );
}

export function daysSince(value: string | null | undefined, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

export function heatFromDays(days: number): HeatLevel {
  if (days <= 3) return "fresh";
  if (days <= 7) return "watch";
  if (days <= 14) return "warm";
  return "hot";
}

export function contactHeat(
  contact: Pick<
    Contact,
    "last_touched_at" | "activities" | "met_at" | "created_at"
  >,
) {
  return heatFromDays(daysSince(latestTouch(contact)));
}

export function compareByStaleness(a: Contact, b: Contact) {
  return daysSince(latestTouch(b)) - daysSince(latestTouch(a));
}
