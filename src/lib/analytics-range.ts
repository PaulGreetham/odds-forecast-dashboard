import { parseDateKey } from "@/lib/date-utils";

export type AnalyticsRangeMode = "7d" | "30d" | "90d" | "180d" | "365d" | "all";

const RANGE_DAYS: Record<Exclude<AnalyticsRangeMode, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export const ANALYTICS_RANGE_OPTIONS: Array<{ value: AnalyticsRangeMode; label: string }> = [
  { value: "7d", label: "Last Week" },
  { value: "30d", label: "Last Month" },
  { value: "90d", label: "Last 3 Months" },
  { value: "180d", label: "Last 6 Months" },
  { value: "365d", label: "Last 12 Months" },
  { value: "all", label: "All Time" },
];

export function getAnalyticsRangeLabel(mode: AnalyticsRangeMode) {
  return ANALYTICS_RANGE_OPTIONS.find((option) => option.value === mode)?.label ?? "All Time";
}

export function resolveAnalyticsRangeStartDate({
  mode,
  endDate,
  firstDateKey,
}: {
  mode: AnalyticsRangeMode;
  endDate: Date;
  firstDateKey?: string;
}) {
  if (mode === "all") {
    return parseDateKey(firstDateKey ?? "") ?? endDate;
  }
  const start = new Date(endDate);
  start.setDate(endDate.getDate() - (RANGE_DAYS[mode] - 1));
  return start;
}
