"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDownIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { useAuthUid } from "@/hooks/firebase/use-auth-uid";
import { useBetsState } from "@/hooks/firebase/use-bets-state";
import { useMatches } from "@/hooks/firebase/use-matches";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatDateDisplay, parseDateKey, toDateKey } from "@/lib/date-utils";
import { formatEuroSigned } from "@/lib/number-format";
import type { MatchBase } from "@/types/domain/match";
import type { ChartRow, MetricsSummary } from "@/types/analytics";

type MatchAnalyticsRow = Pick<MatchBase, "id" | "date" | "odds" | "winnerSide"> & {
  actualWinnerSide: "home" | "away" | "draw" | null;
};

type AccumulatorAnalyticsInput = {
  stake: string;
  matchIds: string[];
  day: string | null;
};

type ExtendedMetrics = {
  averageProfitPerBet: number;
  dailyReturnAverage: number;
  bestDailyReturn: number;
  worstDailyReturn: number;
  totalBets: number;
  bettingDays: number;
};

type MetricsRangeMode = "7d" | "30d" | "90d" | "180d" | "365d" | "all";
type ChartViewMode = "daily" | "weekly" | "monthly" | "quarterly";

const chartConfig = {
  spent: {
    label: "Spent",
    color: "var(--chart-5)",
  },
  received: {
    label: "Received",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function formatDateTick(value: string) {
  const date = parseDateKey(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getStartOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getBucketStart(date: Date, viewMode: ChartViewMode) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (viewMode === "weekly") {
    return getStartOfWeek(d);
  }
  if (viewMode === "monthly") {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  if (viewMode === "quarterly") {
    const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
    return new Date(d.getFullYear(), quarterStartMonth, 1);
  }
  return d;
}

function formatBucketTick(value: string, viewMode: ChartViewMode) {
  const date = parseDateKey(value);
  if (!date) {
    return value;
  }
  if (viewMode === "daily") {
    return formatDateTick(value);
  }
  if (viewMode === "weekly") {
    return `Wk ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  if (viewMode === "monthly") {
    return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return `Q${Math.floor(date.getMonth() / 3) + 1} '${String(date.getFullYear()).slice(-2)}`;
}

function formatBucketTooltip(value: string, viewMode: ChartViewMode) {
  const start = parseDateKey(value);
  if (!start) {
    return String(value);
  }
  if (viewMode === "daily") {
    return formatDateDisplay(value);
  }
  if (viewMode === "weekly") {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${formatDateDisplay(toDateKey(start))} - ${formatDateDisplay(toDateKey(end))}`;
  }
  if (viewMode === "monthly") {
    return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const quarter = Math.floor(start.getMonth() / 3) + 1;
  return `Q${quarter} ${start.getFullYear()}`;
}

function calculatePercentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function CurrencyTicker({ value }: { value: number }) {
  const sign = value < 0 ? "-" : "";
  return (
    <>
      {sign}€
      <NumberTicker
        value={Math.abs(value)}
        decimalPlaces={2}
        className="tracking-normal"
      />
    </>
  );
}

function PercentTicker({ value }: { value: number }) {
  return (
    <>
      <NumberTicker value={value} decimalPlaces={1} className="tracking-normal" />%
    </>
  );
}

function summarizeMetrics(chartRows: ChartRow[], matches: MatchAnalyticsRow[]): MetricsSummary {
  const totals = chartRows.reduce(
    (acc, row) => {
      acc.spent += row.spent;
      acc.received += row.received;
      return acc;
    },
    { spent: 0, received: 0 }
  );

  const dateKeys = new Set(chartRows.map((row) => row.date));
  const rowsInRange = matches.filter((row) => dateKeys.has(row.date));
  const decided = rowsInRange.filter((row) => row.actualWinnerSide !== null);
  const wins = decided.filter((row) => row.actualWinnerSide === row.winnerSide).length;
  const successPercent = decided.length ? (wins / decided.length) * 100 : 0;

  return {
    spent: totals.spent,
    received: totals.received,
    profit: totals.received - totals.spent,
    wins,
    decided: decided.length,
    successPercent,
  };
}

function deriveExtendedMetrics({
  metricData,
  bettingDayRows,
  rows,
  rowStakes,
  defaultStake,
  accumulators,
  summaryProfit,
}: {
  metricData: ChartRow[];
  bettingDayRows: ChartRow[];
  rows: MatchAnalyticsRow[];
  rowStakes: Record<string, string>;
  defaultStake: string;
  accumulators: AccumulatorAnalyticsInput[];
  summaryProfit: number;
}): ExtendedMetrics {
  const metricDateKeys = new Set(metricData.map((row) => row.date));
  const matchesById = new Map(rows.map((row) => [row.id, row]));

  const singlesCount = rows.reduce((count, row) => {
    if (!metricDateKeys.has(row.date)) {
      return count;
    }
    const stakeValue = Number(
      rowStakes[row.id] && rowStakes[row.id] !== "" ? rowStakes[row.id] : defaultStake
    );
    return Number.isFinite(stakeValue) && stakeValue > 0 ? count + 1 : count;
  }, 0);

  const accumulatorsCount = accumulators.reduce((count, accumulator) => {
    if (!accumulator.matchIds.length) {
      return count;
    }
    const stakeValue = Number(accumulator.stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      return count;
    }
    const accumulatorMatches = accumulator.matchIds
      .map((id) => matchesById.get(id))
      .filter((match): match is MatchAnalyticsRow => Boolean(match));
    if (!accumulatorMatches.length) {
      return count;
    }
    const day = accumulator.day ?? accumulatorMatches[0].date;
    if (!day || !metricDateKeys.has(day)) {
      return count;
    }
    return count + 1;
  }, 0);

  const totalBets = singlesCount + accumulatorsCount;
  const averageProfitPerBet = totalBets > 0 ? summaryProfit / totalBets : 0;

  const dailyReturns = bettingDayRows.map((row) => ((row.received - row.spent) / row.spent) * 100);
  const dailyReturnAverage =
    dailyReturns.length > 0
      ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length
      : 0;
  const bestDailyReturn = dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0;
  const worstDailyReturn = dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0;

  return {
    averageProfitPerBet,
    dailyReturnAverage,
    bestDailyReturn,
    worstDailyReturn,
    totalBets,
    bettingDays: bettingDayRows.length,
  };
}

export function AnalyticsSpentReceivedChart() {
  const uid = useAuthUid();
  const [rangeMode, setRangeMode] = useState<MetricsRangeMode>("30d");
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("daily");
  const mapMatch = useCallback(
    (id: string, data: Record<string, unknown>): MatchAnalyticsRow => ({
      id,
      date: String(data.date ?? ""),
      odds: String(data.odds ?? ""),
      winnerSide: data.winnerSide === "away" ? "away" : "home",
      actualWinnerSide:
        data.actualWinnerSide === "home" ||
        data.actualWinnerSide === "away" ||
        data.actualWinnerSide === "draw"
          ? data.actualWinnerSide
          : null,
    }),
    []
  );
  const { rows, error: matchesError } = useMatches(uid, mapMatch, "date", "asc");
  const { betsState, error: betsStateError } = useBetsState(uid);
  const listenerError = matchesError ?? betsStateError ?? null;

  const fullChartData = useMemo<ChartRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = toDateKey(today);

    const byDate = new Map<string, ChartRow>();
    const matchesById = new Map(rows.map((row) => [row.id, row]));

    // Singles (per fixture stakes) - only include dates up to today
    rows.forEach((row) => {
      if (!row.date || row.date > todayKey) {
        return;
      }

      const oddsValue = Number(row.odds);
      const isWinningPrediction =
        row.actualWinnerSide !== null && row.actualWinnerSide === row.winnerSide;
      const stakeValue = Number(
        betsState.rowStakes[row.id] && betsState.rowStakes[row.id] !== ""
          ? betsState.rowStakes[row.id]
          : betsState.defaultStake
      );

      const existing = byDate.get(row.date) ?? {
        date: row.date,
        spent: 0,
        received: 0,
      };

      if (Number.isFinite(stakeValue) && stakeValue > 0) {
        existing.spent += stakeValue;
        if (isWinningPrediction && Number.isFinite(oddsValue) && oddsValue > 0) {
          existing.received += stakeValue * oddsValue;
        }
      }

      byDate.set(row.date, existing);
    });

    // Accumulators (daily stake on combined odds)
    betsState.accumulators.forEach((accumulator) => {
      if (!accumulator.matchIds.length) {
        return;
      }

      const stakeValue = Number(accumulator.stake);
      if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
        return;
      }

      const accumulatorMatches = accumulator.matchIds
        .map((id) => matchesById.get(id))
        .filter((match): match is MatchAnalyticsRow => Boolean(match));
      if (!accumulatorMatches.length) {
        return;
      }

      const day = accumulator.day ?? accumulatorMatches[0].date;
      if (!day || day > todayKey) {
        return;
      }

      const existing = byDate.get(day) ?? {
        date: day,
        spent: 0,
        received: 0,
      };
      existing.spent += stakeValue;

      let allWon = true;
      let combinedOdds = 1;
      for (const match of accumulatorMatches) {
        const oddsValue = Number(match.odds);
        const won = match.actualWinnerSide !== null && match.actualWinnerSide === match.winnerSide;
        if (!won || !Number.isFinite(oddsValue) || oddsValue <= 0) {
          allWon = false;
          break;
        }
        combinedOdds *= oddsValue;
      }

      if (allWon) {
        existing.received += stakeValue * combinedOdds;
      }

      byDate.set(day, existing);
    });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [betsState, rows]);

  const chartData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysByMode: Record<Exclude<MetricsRangeMode, "all">, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
      "365d": 365,
    };
    const maxDate = fullChartData.at(-1)?.date;
    const dataEndDate = maxDate ? parseDateKey(maxDate) : null;
    const endDate = dataEndDate && dataEndDate > today ? today : dataEndDate;
    if (!endDate) {
      return [];
    }

    const startDate =
      rangeMode === "all"
        ? (parseDateKey(fullChartData[0]?.date ?? "") ?? endDate)
        : (() => {
            const start = new Date(endDate);
            start.setDate(endDate.getDate() - (daysByMode[rangeMode] - 1));
            return start;
          })();

    const byDate = new Map(fullChartData.map((row) => [row.date, row]));
    const sequence: ChartRow[] = [];
    const current = new Date(startDate);

    while (current <= endDate && current <= today) {
      const key = toDateKey(current);
      const existing = byDate.get(key) ?? {
        date: key,
        spent: 0,
        received: 0,
      };
      sequence.push(existing);
      current.setDate(current.getDate() + 1);
    }

    return sequence;
  }, [fullChartData, rangeMode]);
  const metricData = chartData.filter((row) => row.spent > 0 || row.received > 0);
  const bettingDayRows = useMemo(
    () => chartData.filter((row) => row.spent > 0),
    [chartData]
  );
  const displayChartData = useMemo(() => {
    if (chartViewMode === "daily") {
      return chartData;
    }
    const bucketMap = new Map<string, ChartRow>();
    chartData.forEach((row) => {
      const parsedDate = parseDateKey(row.date);
      if (!parsedDate) {
        return;
      }
      const bucketStart = getBucketStart(parsedDate, chartViewMode);
      const bucketKey = toDateKey(bucketStart);
      const existing = bucketMap.get(bucketKey) ?? { date: bucketKey, spent: 0, received: 0 };
      existing.spent += row.spent;
      existing.received += row.received;
      bucketMap.set(bucketKey, existing);
    });
    return Array.from(bucketMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [chartData, chartViewMode]);

  const topSummary = useMemo(() => summarizeMetrics(metricData, rows), [metricData, rows]);
  const topExtendedMetrics = useMemo(
    () =>
      deriveExtendedMetrics({
        metricData,
        bettingDayRows,
        rows,
        rowStakes: betsState.rowStakes,
        defaultStake: betsState.defaultStake,
        accumulators: betsState.accumulators,
        summaryProfit: topSummary.profit,
      }),
    [
      betsState.accumulators,
      betsState.defaultStake,
      betsState.rowStakes,
      bettingDayRows,
      metricData,
      rows,
      topSummary.profit,
    ]
  );

  const previousChartData = useMemo(() => {
    if (!chartData.length) {
      return [] as ChartRow[];
    }
    const currentStart = parseDateKey(chartData[0]?.date ?? "");
    if (!currentStart) {
      return [] as ChartRow[];
    }
    const days = chartData.length;
    const prevEnd = new Date(currentStart);
    prevEnd.setDate(currentStart.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (days - 1));

    const byDate = new Map(fullChartData.map((row) => [row.date, row]));
    const sequence: ChartRow[] = [];
    const current = new Date(prevStart);
    while (current <= prevEnd) {
      const key = toDateKey(current);
      sequence.push(byDate.get(key) ?? { date: key, spent: 0, received: 0 });
      current.setDate(current.getDate() + 1);
    }
    return sequence;
  }, [chartData, fullChartData]);

  const previousMetricData = useMemo(
    () => previousChartData.filter((row) => row.spent > 0 || row.received > 0),
    [previousChartData]
  );
  const previousBettingDayRows = useMemo(
    () => previousChartData.filter((row) => row.spent > 0),
    [previousChartData]
  );
  const previousSummary = useMemo(
    () => summarizeMetrics(previousMetricData, rows),
    [previousMetricData, rows]
  );

  const previousExtendedMetrics = useMemo(
    () =>
      deriveExtendedMetrics({
        metricData: previousMetricData,
        bettingDayRows: previousBettingDayRows,
        rows,
        rowStakes: betsState.rowStakes,
        defaultStake: betsState.defaultStake,
        accumulators: betsState.accumulators,
        summaryProfit: previousSummary.profit,
      }),
    [
      betsState.accumulators,
      betsState.defaultStake,
      betsState.rowStakes,
      previousBettingDayRows,
      previousMetricData,
      previousSummary.profit,
      rows,
    ]
  );

  const currentReturnPercent =
    topSummary.spent > 0 ? ((topSummary.received - topSummary.spent) / topSummary.spent) * 100 : 0;
  const previousReturnPercent =
    previousSummary.spent > 0
      ? ((previousSummary.received - previousSummary.spent) / previousSummary.spent) * 100
      : 0;

  const metricTrends = {
    profit: calculatePercentChange(topSummary.profit, previousSummary.profit),
    spent: calculatePercentChange(topSummary.spent, previousSummary.spent),
    received: calculatePercentChange(topSummary.received, previousSummary.received),
    avgProfitPerBet: calculatePercentChange(
      topExtendedMetrics.averageProfitPerBet,
      previousExtendedMetrics.averageProfitPerBet
    ),
    returnPercent: calculatePercentChange(currentReturnPercent, previousReturnPercent),
    winnerPercent: calculatePercentChange(topSummary.successPercent, previousSummary.successPercent),
    bestDaily: calculatePercentChange(
      topExtendedMetrics.bestDailyReturn,
      previousExtendedMetrics.bestDailyReturn
    ),
    worstDaily: calculatePercentChange(
      topExtendedMetrics.worstDailyReturn,
      previousExtendedMetrics.worstDailyReturn
    ),
  };

  const renderTrendIndicator = (change: number | null) => {
    if (change === null) {
      return null;
    }
    const positive = change >= 0;
    return (
      <div className={`flex items-center gap-1 text-xs ${positive ? "text-emerald-500" : "text-red-500"}`}>
        {positive ? <TrendingUpIcon className="size-4" /> : <TrendingDownIcon className="size-4" />}
        {`${positive ? "+" : ""}${change.toFixed(1)}%`}
      </div>
    );
  };

  const rangeLabel =
    rangeMode === "7d"
      ? "Last Week"
      : rangeMode === "30d"
        ? "Last Month"
        : rangeMode === "90d"
          ? "Last 3 Months"
          : rangeMode === "180d"
            ? "Last 6 Months"
            : rangeMode === "365d"
              ? "Last 12 Months"
              : "All Time";

  return (
    <div className="space-y-6 pb-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Total Metrics</CardTitle>
              <CardDescription>
                Absolute totals using the same time filter as the chart.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="outline" className="w-[180px] justify-between rounded-lg">
                      {rangeLabel}
                      <ChevronDownIcon className="size-4 opacity-70" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-[180px] rounded-xl">
                  <DropdownMenuItem onClick={() => setRangeMode("7d")}>Last Week</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRangeMode("30d")}>Last Month</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRangeMode("90d")}>Last 3 Months</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRangeMode("180d")}>Last 6 Months</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRangeMode("365d")}>Last 12 Months</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRangeMode("all")}>All Time</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Profit</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <CurrencyTicker value={topSummary.profit} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.profit)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">
                  {topSummary.profit >= 0 ? "Positive return" : "Negative return"}
                </div>
                <div className="text-muted-foreground">Received minus spent vs previous period</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Spent</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <CurrencyTicker value={topSummary.spent} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.spent)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Stake outflow</div>
                <div className="text-muted-foreground">Singles and accumulators</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Received</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <CurrencyTicker value={topSummary.received} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.received)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Total returns received</div>
                <div className="text-muted-foreground">Winning singles and accumulators</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Avg Profit per Bet</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <CurrencyTicker value={topExtendedMetrics.averageProfitPerBet} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.avgProfitPerBet)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">
                  Across {topExtendedMetrics.totalBets} total bets
                </div>
                <div className="text-muted-foreground">Profit divided by singles + accumulators</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Return %</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <PercentTicker
                    value={
                      topSummary.spent > 0
                        ? ((topSummary.received - topSummary.spent) / topSummary.spent) * 100
                        : 0
                    }
                  />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.returnPercent)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Overall period ROI</div>
                <div className="text-muted-foreground">(Received minus spent) / spent</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Winner Prediction %</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <PercentTicker value={topSummary.successPercent} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.winnerPercent)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">
                  {topSummary.wins} correct from {topSummary.decided} decided
                </div>
                <div className="text-muted-foreground">Prediction hit rate in selected period</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Best Daily Return %</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <PercentTicker value={topExtendedMetrics.bestDailyReturn} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.bestDaily)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Highest day in range</div>
                <div className="text-muted-foreground">Only days with stake placed are included</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Worst Daily Return %</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  <PercentTicker value={topExtendedMetrics.worstDailyReturn} />
                </CardTitle>
                <CardAction>{renderTrendIndicator(metricTrends.worstDaily)}</CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Lowest day in range</div>
                <div className="text-muted-foreground">Only days with stake placed are included</div>
              </CardFooter>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="pt-0">
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <div>
              <CardTitle>Spent vs Received - Interactive Bars</CardTitle>
              <CardDescription>
                Stacked daily performance using your betting and result outcomes.
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" className="ml-auto w-[160px] justify-between rounded-lg">
                  {chartViewMode === "daily"
                    ? "Daily"
                    : chartViewMode === "weekly"
                      ? "Weekly"
                      : chartViewMode === "monthly"
                        ? "Monthly"
                        : "Quarterly"}
                  <ChevronDownIcon className="size-4 opacity-70" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-[160px] rounded-xl">
              <DropdownMenuItem onClick={() => setChartViewMode("daily")}>Daily</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChartViewMode("weekly")}>Weekly</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChartViewMode("monthly")}>Monthly</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChartViewMode("quarterly")}>Quarterly</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-6 px-2 pt-4 pb-6 sm:px-6 sm:pt-6">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {listenerError ??
                "No chart data yet. Add matches and set results to populate analytics."}
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[420px] w-full">
              <BarChart
                data={displayChartData}
                margin={{
                  left: 8,
                  right: 16,
                  top: 8,
                  bottom: 24,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={36}
                  interval="preserveStartEnd"
                  tickFormatter={(value) => formatBucketTick(String(value), chartViewMode)}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatBucketTooltip(String(value), chartViewMode)}
                      formatter={(value) => Number(value ?? 0).toFixed(2)}
                      extraRows={(payload) => {
                        const spent = Number(
                          payload.find((item) => String(item.dataKey ?? "") === "spent")?.value ?? 0
                        );
                        const received = Number(
                          payload.find((item) => String(item.dataKey ?? "") === "received")?.value ?? 0
                        );
                        const profit = received - spent;
                        const returnPercent =
                          spent > 0 ? ((received - spent) / spent) * 100 : 0;
                        const returnLabel = `${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(1)}%`;
                        const colorClass =
                          profit >= 0 ? "text-emerald-500" : "text-red-500";

                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Profit</span>
                              <span
                                className={`font-mono font-medium tabular-nums ${colorClass}`}
                              >
                                {formatEuroSigned(profit)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Return %</span>
                              <span
                                className={`font-mono font-medium tabular-nums ${colorClass}`}
                              >
                                {returnLabel}
                              </span>
                            </div>
                          </>
                        );
                      }}
                    />
                  }
                />
                <Legend />
                <Bar
                  dataKey="spent"
                  stackId="total"
                  fill="var(--color-spent)"
                  isAnimationActive
                  animationDuration={700}
                  radius={[0, 0, 3, 3]}
                />
                <Bar
                  dataKey="received"
                  stackId="total"
                  fill="var(--color-received)"
                  isAnimationActive
                  animationDuration={700}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
