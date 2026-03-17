"use client";

import { type ReactNode, useMemo, useState } from "react";
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
import { mapMatchOutcomeRow, type MatchOutcomeRow } from "@/hooks/firebase/match-mappers";
import { useMatches } from "@/hooks/firebase/use-matches";
import { Button } from "@/components/ui/button";
import { AnalyticsRangeSelect } from "@/components/ui/analytics-range-select";
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
import {
  type AnalyticsRangeMode,
} from "@/lib/analytics-range";
import { aggregateDailySpentReceived } from "@/lib/analytics-aggregation";
import { buildDailySeriesInRange } from "@/lib/analytics-series";
import { formatEuroSigned } from "@/lib/number-format";
import type { ChartRow, MetricsSummary } from "@/types/analytics";

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

function MetricsStatCard({
  description,
  value,
  trend,
  headline,
  subline,
}: {
  description: string;
  value: ReactNode;
  trend: ReactNode;
  headline: ReactNode;
  subline: ReactNode;
}) {
  return (
    <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>{trend}</CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{headline}</div>
        <div className="text-muted-foreground">{subline}</div>
      </CardFooter>
    </Card>
  );
}

function summarizeMetrics(chartRows: ChartRow[], matches: MatchOutcomeRow[]): MetricsSummary {
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
  rows: MatchOutcomeRow[];
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
      .filter((match): match is MatchOutcomeRow => Boolean(match));
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
  const [rangeMode, setRangeMode] = useState<AnalyticsRangeMode>("30d");
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("daily");
  const { rows, error: matchesError } = useMatches(uid, mapMatchOutcomeRow, "date", "asc");
  const { betsState, error: betsStateError } = useBetsState(uid);
  const listenerError = matchesError ?? betsStateError ?? null;

  const fullChartData = useMemo<ChartRow[]>(() => {
    return aggregateDailySpentReceived(rows, betsState);
  }, [betsState, rows]);

  const chartData = useMemo(() => {
    return buildDailySeriesInRange<ChartRow>({
      rows: fullChartData,
      rangeMode,
      createEmptyRow: (date) => ({ date, spent: 0, received: 0 }),
    });
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
              <AnalyticsRangeSelect
                value={rangeMode}
                onChange={setRangeMode}
                triggerClassName="w-[180px] justify-between rounded-lg"
                contentClassName="w-[180px] rounded-xl"
                align="end"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricsStatCard
              description="Total Profit"
              value={<CurrencyTicker value={topSummary.profit} />}
              trend={renderTrendIndicator(metricTrends.profit)}
              headline={topSummary.profit >= 0 ? "Positive return" : "Negative return"}
              subline="Received minus spent vs previous period"
            />
            <MetricsStatCard
              description="Total Spent"
              value={<CurrencyTicker value={topSummary.spent} />}
              trend={renderTrendIndicator(metricTrends.spent)}
              headline="Stake outflow"
              subline="Singles and accumulators"
            />
            <MetricsStatCard
              description="Total Received"
              value={<CurrencyTicker value={topSummary.received} />}
              trend={renderTrendIndicator(metricTrends.received)}
              headline="Total returns received"
              subline="Winning singles and accumulators"
            />
            <MetricsStatCard
              description="Avg Profit per Bet"
              value={<CurrencyTicker value={topExtendedMetrics.averageProfitPerBet} />}
              trend={renderTrendIndicator(metricTrends.avgProfitPerBet)}
              headline={`Across ${topExtendedMetrics.totalBets} total bets`}
              subline="Profit divided by singles + accumulators"
            />
            <MetricsStatCard
              description="Return %"
              value={
                <PercentTicker
                  value={
                    topSummary.spent > 0
                      ? ((topSummary.received - topSummary.spent) / topSummary.spent) * 100
                      : 0
                  }
                />
              }
              trend={renderTrendIndicator(metricTrends.returnPercent)}
              headline="Overall period ROI"
              subline="(Received minus spent) / spent"
            />
            <MetricsStatCard
              description="Winner Prediction %"
              value={<PercentTicker value={topSummary.successPercent} />}
              trend={renderTrendIndicator(metricTrends.winnerPercent)}
              headline={`${topSummary.wins} correct from ${topSummary.decided} decided`}
              subline="Prediction hit rate in selected period"
            />
            <MetricsStatCard
              description="Best Daily Return %"
              value={<PercentTicker value={topExtendedMetrics.bestDailyReturn} />}
              trend={renderTrendIndicator(metricTrends.bestDaily)}
              headline="Highest day in range"
              subline="Only days with stake placed are included"
            />
            <MetricsStatCard
              description="Worst Daily Return %"
              value={<PercentTicker value={topExtendedMetrics.worstDailyReturn} />}
              trend={renderTrendIndicator(metricTrends.worstDaily)}
              headline="Lowest day in range"
              subline="Only days with stake placed are included"
            />
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
