import { parseDateKey } from "@/lib/date-utils";
import type { AccumulatorLike } from "@/types/domain/bets";
import type { MatchBase } from "@/types/domain/match";

function formatAccumulatorDateLabel(dayKey: string) {
  const parsed = parseDateKey(dayKey) ?? new Date(dayKey);
  if (Number.isNaN(parsed.getTime())) {
    return dayKey;
  }
  const day = parsed.getDate();
  const month = parsed.getMonth() + 1;
  const year = parsed.getFullYear() % 100;
  return `${day}/${month}/${year}`;
}

export function buildAccumulatorName(dayKey: string, index: number) {
  const dateLabel = formatAccumulatorDateLabel(dayKey);
  return index === 1
    ? `${dateLabel} Accumulator`
    : `${dateLabel} Accumulator ${index}`;
}

export function serializeBetsState(state: {
  defaultStake: string;
  rowStakes: Record<string, string>;
  accumulators: (AccumulatorLike & { note?: string })[];
  activeAccumulatorId: string;
}) {
  const sortedRowStakes = Object.fromEntries(
    Object.entries(state.rowStakes).sort(([a], [b]) => a.localeCompare(b))
  );
  const normalized = {
    defaultStake: state.defaultStake,
    rowStakes: sortedRowStakes,
    accumulators: state.accumulators.map((item) => ({
      id: item.id,
      name: item.name,
      stake: item.stake,
      matchIds: [...item.matchIds],
      day: item.day,
      note: item.note ?? "",
    })),
    activeAccumulatorId: state.activeAccumulatorId,
  };
  return JSON.stringify(normalized);
}

type AccumulatorWithNote = AccumulatorLike & { note: string };

type BetsMatchSummaryRow = Pick<MatchBase, "id" | "date" | "homeTeam" | "awayTeam" | "odds">;

export type AccumulatorSummaryRow = AccumulatorWithNote & {
  matches: BetsMatchSummaryRow[];
  combinedOdds: number;
  potentialReturn: number;
  profit: number;
};

export function reconcileAccumulatorsWithRows(
  accumulators: AccumulatorWithNote[],
  rows: Pick<MatchBase, "id" | "date">[],
  fallbackAccumulator: AccumulatorWithNote
) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const cleaned = accumulators.map((accumulator) => {
    const validIds = accumulator.matchIds.filter((id) => rowsById.has(id));
    const firstRow = rowsById.get(validIds[0]);
    return {
      ...accumulator,
      matchIds: validIds,
      day: firstRow?.date ?? null,
    };
  });

  return cleaned.length ? cleaned : [fallbackAccumulator];
}

export function buildAccumulatorNameMap(accumulators: AccumulatorWithNote[]) {
  const countsByDay: Record<string, number> = {};
  const next: Record<string, string> = {};

  accumulators.forEach((accumulator) => {
    if (!accumulator.day) {
      next[accumulator.id] = accumulator.name;
      return;
    }
    const dayKey = accumulator.day;
    const index = (countsByDay[dayKey] ?? 0) + 1;
    countsByDay[dayKey] = index;
    next[accumulator.id] = buildAccumulatorName(dayKey, index);
  });

  return next;
}

export function buildAccumulatorSummaries(
  accumulators: AccumulatorWithNote[],
  rows: BetsMatchSummaryRow[]
): AccumulatorSummaryRow[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return accumulators.map((accumulator) => {
    const matches = accumulator.matchIds
      .map((id) => rowsById.get(id))
      .filter((row): row is BetsMatchSummaryRow => Boolean(row));
    const combinedOdds = matches.reduce((total, row) => {
      const parsed = Number(row.odds);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return total;
      }
      return total * parsed;
    }, 1);
    const stakeValue = Number(accumulator.stake) || 0;
    const potentialReturn = matches.length ? combinedOdds * stakeValue : 0;
    const profit = potentialReturn - stakeValue;
    return {
      ...accumulator,
      matches,
      combinedOdds,
      potentialReturn,
      profit,
    };
  });
}

