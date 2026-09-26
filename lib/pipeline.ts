import type { HeatLevel } from "./heat.ts";

const DAY_MS = 86_400_000;

export type PipelineActivityFilter = "all" | HeatLevel;
export type PipelineOwnerFilter = "all" | "unassigned" | string;

export type ActivityDateRange = {
  afterExclusive?: string;
  beforeInclusive?: string;
};

export function sanitizeContactSearch(value: string) {
  return value
    .replace(/[,%_()\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function parsePipelinePage(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export function parsePipelineActivity(
  value: string | null | undefined,
): PipelineActivityFilter {
  return ["fresh", "watch", "warm", "hot"].includes(value ?? "")
    ? (value as HeatLevel)
    : "all";
}

export function parsePipelineOwner(
  value: string | null | undefined,
): PipelineOwnerFilter {
  if (!value || value === "all") return "all";
  if (value === "unassigned") return value;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : "all";
}

export function activityDateRange(
  activity: PipelineActivityFilter,
  now = new Date(),
): ActivityDateRange {
  const before = (days: number) =>
    new Date(now.getTime() - days * DAY_MS).toISOString();

  switch (activity) {
    case "fresh":
      return { afterExclusive: before(4) };
    case "watch":
      return {
        afterExclusive: before(8),
        beforeInclusive: before(4),
      };
    case "warm":
      return {
        afterExclusive: before(15),
        beforeInclusive: before(8),
      };
    case "hot":
      return { beforeInclusive: before(15) };
    default:
      return {};
  }
}
