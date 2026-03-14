export type ChartRow = {
  date: string;
  spent: number;
  received: number;
};

export type ProfitRow = {
  date: string;
  profit: number;
  spent: number;
  received: number;
};

export type MetricsSummary = {
  spent: number;
  received: number;
  profit: number;
  wins: number;
  decided: number;
  successPercent: number;
};

export type AnalyticsTableRow = {
  id: string;
  date: string;
  fixture: string;
  competition: string;
  country: string;
  predictedWinner: string;
  actualWinner: string;
  outcome: "Win" | "Loss" | "Pending";
  winPercent: number;
  odds: number;
  stake: number;
  return: number;
  profit: number;
  accumulatorCount: number;
};

export type AccumulatorAnalyticsRow = {
  id: string;
  name: string;
  day: string | null;
  games: number;
  combinedOdds: number;
  stake: number;
  return: number;
  profit: number;
};

