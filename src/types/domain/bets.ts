export type AccumulatorLike = {
  id: string;
  name: string;
  stake: string;
  matchIds: string[];
  day: string | null;
  note?: string;
};

export type BetsState = {
  defaultStake: string;
  rowStakes: Record<string, string>;
  accumulators: AccumulatorLike[];
  activeAccumulatorId?: string;
};

