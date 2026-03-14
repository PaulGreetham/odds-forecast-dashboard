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
import type { DateRange } from "react-day-picker";

import { useAuthUid } from "@/hooks/firebase/use-auth-uid";
import { useBetsState } from "@/hooks/firebase/use-bets-state";
import { useMatches } from "@/hooks/firebase/use-matches";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateDisplay, parseDateKey, toDateKey } from "@/lib/date-utils";
import type { MatchBase } from "@/types/domain/match";
import type { ChartRow, MetricsSummary } from "@/types/analytics";
import type { RangeMode } from "@/types/filters";

type MatchAnalyticsRow = Pick<MatchBase, "id" | "date" | "odds" | "winnerSide"> & {
  actualWinnerSide: "home" | "away" | "draw" | null;
};

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

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
}

function formatDeltaCurrency(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
}

function formatDeltaPercentPoints(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(1)}pp`;
}

function filterChartRowsByBounds(rows: ChartRow[], start: Date, end: Date) {
  return rows.filter((row) => {
    const date = parseDateKey(row.date);
    return Boolean(date && date >= start && date <= end);
  });
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

export function AnalyticsSpentReceivedChart() {
  const uid = useAuthUid();
  const [rangeMode, setRangeMode] = useState<RangeMode>("90d");
  const [metricFilterMode, setMetricFilterMode] = useState<"preset" | "range">("preset");
  const [metricRangeMode, setMetricRangeMode] = useState<RangeMode>("30d");
  const [metricDateRange, setMetricDateRange] = useState<DateRange | undefined>(undefined);
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
    const byDate = new Map<string, ChartRow>();
    const matchesById = new Map(rows.map((row) => [row.id, row]));

    // Singles (per fixture stakes)
    rows.forEach((row) => {
      if (!row.date) {
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
      if (!day) {
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
    const days = rangeMode === "7d" ? 7 : rangeMode === "30d" ? 30 : 90;
    const maxDate = fullChartData.at(-1)?.date;
    const endDate = maxDate ? parseDateKey(maxDate) : null;
    if (!endDate) {
      return [];
    }

    const byDate = new Map(fullChartData.map((row) => [row.date, row]));
    const sequence: ChartRow[] = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const current = new Date(endDate);
      current.setDate(endDate.getDate() - offset);
      const key = toDateKey(current);
      const existing = byDate.get(key);
      sequence.push(
        existing ?? {
          date: key,
          spent: 0,
          received: 0,
        }
      );
    }

    return sequence;
  }, [fullChartData, rangeMode]);

  const metricData = useMemo(() => {
    if (metricFilterMode === "preset") {
      const days = metricRangeMode === "7d" ? 7 : metricRangeMode === "30d" ? 30 : 90;
      const maxDate = fullChartData.at(-1)?.date;
      const endDate = maxDate ? parseDateKey(maxDate) : null;
      if (!endDate) {
        return [];
      }
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - (days - 1));
      return fullChartData.filter((row) => {
        const date = parseDateKey(row.date);
        return Boolean(date && date >= startDate && date <= endDate);
      });
    }

    if (!metricDateRange?.from && !metricDateRange?.to) {
      return fullChartData;
    }

    const from = metricDateRange.from
      ? new Date(
          metricDateRange.from.getFullYear(),
          metricDateRange.from.getMonth(),
          metricDateRange.from.getDate()
        )
      : null;
    const toRaw = metricDateRange.to ?? metricDateRange.from ?? null;
    const to = toRaw
      ? new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999)
      : null;

    return fullChartData.filter((row) => {
      const date = parseDateKey(row.date);
      if (!date) {
        return false;
      }
      if (from && date < from) {
        return false;
      }
      if (to && date > to) {
        return false;
      }
      return true;
    });
  }, [fullChartData, metricDateRange, metricFilterMode, metricRangeMode]);

  const topSummary = useMemo(() => summarizeMetrics(metricData, rows), [metricData, rows]);
  const chartSummary = useMemo(() => summarizeMetrics(chartData, rows), [chartData, rows]);

  const topPreviousSummary = useMemo(() => {
    if (!fullChartData.length) {
      return summarizeMetrics([], rows);
    }

    if (metricFilterMode === "preset") {
      const days = metricRangeMode === "7d" ? 7 : metricRangeMode === "30d" ? 30 : 90;
      const maxDate = fullChartData.at(-1)?.date;
      const endDate = maxDate ? parseDateKey(maxDate) : null;
      if (!endDate) {
        return summarizeMetrics([], rows);
      }
      const currentStart = new Date(endDate);
      currentStart.setDate(endDate.getDate() - (days - 1));
      const prevEnd = new Date(currentStart);
      prevEnd.setDate(currentStart.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - (days - 1));
      return summarizeMetrics(filterChartRowsByBounds(fullChartData, prevStart, prevEnd), rows);
    }

    if (!metricDateRange?.from && !metricDateRange?.to) {
      return summarizeMetrics([], rows);
    }

    const start = metricDateRange?.from
      ? new Date(
          metricDateRange.from.getFullYear(),
          metricDateRange.from.getMonth(),
          metricDateRange.from.getDate()
        )
      : null;
    const endRaw = metricDateRange?.to ?? metricDateRange?.from ?? null;
    const end = endRaw
      ? new Date(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate())
      : null;
    if (!start || !end) {
      return summarizeMetrics([], rows);
    }

    const days = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    );
    const prevEnd = new Date(start);
    prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (days - 1));
    return summarizeMetrics(filterChartRowsByBounds(fullChartData, prevStart, prevEnd), rows);
  }, [fullChartData, metricDateRange, metricFilterMode, metricRangeMode, rows]);

  const chartPreviousSummary = useMemo(() => {
    if (!chartData.length) {
      return summarizeMetrics([], rows);
    }

    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const start = parseDateKey(first.date);
    const end = parseDateKey(last.date);
    if (!start || !end) {
      return summarizeMetrics([], rows);
    }

    const days = chartData.length;
    const prevEnd = new Date(start);
    prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (days - 1));

    return summarizeMetrics(filterChartRowsByBounds(fullChartData, prevStart, prevEnd), rows);
  }, [chartData, fullChartData, rows]);

  const topDeltas = {
    profit: topSummary.profit - topPreviousSummary.profit,
    spent: topSummary.spent - topPreviousSummary.spent,
    received: topSummary.received - topPreviousSummary.received,
    success: topSummary.successPercent - topPreviousSummary.successPercent,
  };

  const chartDeltas = {
    profit: chartSummary.profit - chartPreviousSummary.profit,
    spent: chartSummary.spent - chartPreviousSummary.spent,
    received: chartSummary.received - chartPreviousSummary.received,
    success: chartSummary.successPercent - chartPreviousSummary.successPercent,
  };

  const rangeLabel =
    rangeMode === "90d"
      ? "Last 3 months"
      : rangeMode === "30d"
        ? "Last 30 days"
        : "Last 7 days";

  const metricRangeLabel =
    metricRangeMode === "90d"
      ? "Last 3 months"
      : metricRangeMode === "30d"
        ? "Last 30 days"
        : "Last 7 days";

  return (
    <div className="space-y-6 pb-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Total Metrics</CardTitle>
              <CardDescription>
                Absolute totals using an independent metric time selector.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Metric Filter</Label>
                <div className="inline-flex rounded-md border p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={metricFilterMode === "preset" ? "default" : "ghost"}
                    onClick={() => setMetricFilterMode("preset")}
                  >
                    Preset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={metricFilterMode === "range" ? "default" : "ghost"}
                    onClick={() => setMetricFilterMode("range")}
                  >
                    Date Range
                  </Button>
                </div>
              </div>

              {metricFilterMode === "preset" ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Range</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="w-[180px] justify-between rounded-lg"
                        >
                          {metricRangeLabel}
                          <ChevronDownIcon className="size-4 opacity-70" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-[180px] rounded-xl">
                      <DropdownMenuItem onClick={() => setMetricRangeMode("90d")}>
                        Last 3 months
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetricRangeMode("30d")}>
                        Last 30 days
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetricRangeMode("7d")}>
                        Last 7 days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date Range</Label>
                  <Popover modal={false}>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="w-[260px] justify-start font-normal"
                        >
                          {metricDateRange?.from
                            ? metricDateRange.to
                              ? `${formatDateDisplay(
                                  toDateKey(metricDateRange.from)
                                )} - ${formatDateDisplay(toDateKey(metricDateRange.to))}`
                              : formatDateDisplay(toDateKey(metricDateRange.from))
                            : "Pick date range"}
                        </Button>
                      }
                    />
                    <PopoverContent align="end" className="w-auto p-0" initialFocus={false}>
                      <Calendar
                        mode="range"
                        selected={metricDateRange}
                        onSelect={setMetricDateRange}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Profit</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatCurrency(topSummary.profit)}
                </CardTitle>
                <CardAction>
                  {topDeltas.profit >= 0 ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <TrendingUpIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.profit)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <TrendingDownIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.profit)}
                    </div>
                  )}
                </CardAction>
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
                <CardDescription>Total % Win</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {topSummary.successPercent.toFixed(1)}%
                </CardTitle>
                <CardAction>
                  {topDeltas.success >= 0 ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <TrendingUpIcon className="size-4" />
                      {formatDeltaPercentPoints(topDeltas.success)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <TrendingDownIcon className="size-4" />
                      {formatDeltaPercentPoints(topDeltas.success)}
                    </div>
                  )}
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">
                  {topSummary.wins} correct from {topSummary.decided} decided
                </div>
                <div className="text-muted-foreground">Compared with previous period</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Spent</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatCurrency(topSummary.spent)}
                </CardTitle>
                <CardAction>
                  {topDeltas.spent >= 0 ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <TrendingUpIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.spent)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <TrendingDownIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.spent)}
                    </div>
                  )}
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Stake outflow</div>
                <div className="text-muted-foreground">Singles and accumulators vs previous period</div>
              </CardFooter>
            </Card>

            <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardDescription>Total Received</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatCurrency(topSummary.received)}
                </CardTitle>
                <CardAction>
                  {topDeltas.received >= 0 ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <TrendingUpIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.received)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <TrendingDownIcon className="size-4" />
                      {formatDeltaCurrency(topDeltas.received)}
                    </div>
                  )}
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">Total returns received</div>
                <div className="text-muted-foreground">
                  Winning singles and accumulators vs previous period
                </div>
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
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto w-[180px] justify-between rounded-lg"
                >
                  {rangeLabel}
                  <ChevronDownIcon className="size-4 opacity-70" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-[180px] rounded-xl">
              <DropdownMenuItem onClick={() => setRangeMode("90d")}>
                Last 3 months
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRangeMode("30d")}>
                Last 30 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRangeMode("7d")}>
                Last 7 days
              </DropdownMenuItem>
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
                data={chartData}
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
                  tickFormatter={formatDateTick}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatDateDisplay(String(value))}
                      formatter={(value) => Number(value ?? 0).toFixed(2)}
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

          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">Range Metrics</h3>
              <p className="text-sm text-muted-foreground">
                These metrics follow the chart time selector above.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
                <CardHeader>
                  <CardDescription>Profit</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatCurrency(chartSummary.profit)}
                  </CardTitle>
                  <CardAction>
                    {chartDeltas.profit >= 0 ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-500">
                        <TrendingUpIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.profit)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-red-500">
                        <TrendingDownIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.profit)}
                      </div>
                    )}
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    {chartSummary.profit >= 0 ? "Positive return" : "Negative return"}
                  </div>
                  <div className="text-muted-foreground">Received minus spent vs previous period</div>
                </CardFooter>
              </Card>

              <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
                <CardHeader>
                  <CardDescription>Spent</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatCurrency(chartSummary.spent)}
                  </CardTitle>
                  <CardAction>
                    {chartDeltas.spent >= 0 ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-500">
                        <TrendingUpIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.spent)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-red-500">
                        <TrendingDownIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.spent)}
                      </div>
                    )}
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">Stake outflow</div>
                  <div className="text-muted-foreground">Singles and accumulators vs previous period</div>
                </CardFooter>
              </Card>

              <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
                <CardHeader>
                  <CardDescription>Received</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatCurrency(chartSummary.received)}
                  </CardTitle>
                  <CardAction>
                    {chartDeltas.received >= 0 ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-500">
                        <TrendingUpIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.received)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-red-500">
                        <TrendingDownIcon className="size-4" />
                        {formatDeltaCurrency(chartDeltas.received)}
                      </div>
                    )}
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                  Returns received
                  </div>
                  <div className="text-muted-foreground">
                    Winning singles and accumulators vs previous period
                  </div>
                </CardFooter>
              </Card>

              <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
                <CardHeader>
                  <CardDescription>% Win</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {chartSummary.successPercent.toFixed(1)}%
                  </CardTitle>
                  <CardAction>
                    {chartDeltas.success >= 0 ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-500">
                        <TrendingUpIcon className="size-4" />
                        {formatDeltaPercentPoints(chartDeltas.success)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-red-500">
                        <TrendingDownIcon className="size-4" />
                        {formatDeltaPercentPoints(chartDeltas.success)}
                      </div>
                    )}
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    {chartSummary.wins} correct from {chartSummary.decided} decided
                  </div>
                  <div className="text-muted-foreground">Compared with previous period</div>
                </CardFooter>
              </Card>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
