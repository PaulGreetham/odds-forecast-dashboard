import { parseDateKey } from "@/lib/date-utils";
import type { AccumulatorLike } from "@/types/domain/bets";

export function formatAccumulatorDateLabel(dayKey: string) {
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

