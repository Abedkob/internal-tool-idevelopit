import { daysSince, heatFromDays, latestTouch } from "@/lib/heat";
import { relDate } from "@/lib/format";
import type { Contact } from "@/types/db";

const labels = {
  fresh: "Fresh",
  watch: "Watch",
  warm: "Warm",
  hot: "Needs attention",
};

export function HeatChip({
  contact,
  compact = false,
}: {
  contact: Pick<
    Contact,
    "last_touched_at" | "activities" | "met_at" | "created_at"
  >;
  compact?: boolean;
}) {
  const touched = latestTouch(contact);
  const level = heatFromDays(daysSince(touched));
  if (compact) {
    return (
      <span
        className={`heat-dot heat-${level}`}
        title={`${labels[level]} — ${relDate(touched)}`}
        aria-label={`${labels[level]}, last touched ${relDate(touched)}`}
      />
    );
  }
  return (
    <span className={`heat-chip heat-${level}`}>
      <span className="heat-dot" />
      {relDate(touched)}
    </span>
  );
}
