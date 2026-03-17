import { parseDateKey, toDateKey } from "@/lib/date-utils";
import { resolveAnalyticsRangeStartDate, type AnalyticsRangeMode } from "@/lib/analytics-range";

type DatedRow = { date: string };

export function buildDailySeriesInRange<TRow extends DatedRow>({
  rows,
  rangeMode,
  createEmptyRow,
}: {
  rows: TRow[];
  rangeMode: AnalyticsRangeMode;
  createEmptyRow: (date: string) => TRow;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = rows.at(-1)?.date;
  const dataEndDate = maxDate ? parseDateKey(maxDate) : null;
  const endDate = dataEndDate && dataEndDate > today ? today : dataEndDate;
  if (!endDate) {
    return [] as TRow[];
  }

  const startDate = resolveAnalyticsRangeStartDate({
    mode: rangeMode,
    endDate,
    firstDateKey: rows[0]?.date,
  });

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const next: TRow[] = [];
  const current = new Date(startDate);

  while (current <= endDate && current <= today) {
    const key = toDateKey(current);
    next.push(byDate.get(key) ?? createEmptyRow(key));
    current.setDate(current.getDate() + 1);
  }

  return next;
}
