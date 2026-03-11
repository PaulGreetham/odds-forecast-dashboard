"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDownIcon } from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type MatchAnalyticsRow = {
  id: string;
  date: string;
  odds: string;
  winnerSide: "home" | "away";
  actualWinnerSide: "home" | "away" | null;
};

type ChartRow = {
  date: string;
  spent: number;
  received: number;
};

type RangeMode = "7d" | "30d" | "90d";

type PersistedAccumulator = {
  id: string;
  stake: string;
  matchIds: string[];
  day: string | null;
};

type BetsState = {
  defaultStake: string;
  rowStakes: Record<string, string>;
  accumulators: PersistedAccumulator[];
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

function parseDateKey(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(value: string) {
  const date = parseDateKey(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

export function AnalyticsSpentReceivedChart() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [rows, setRows] = useState<MatchAnalyticsRow[]>([]);
  const [betsState, setBetsState] = useState<BetsState>({
    defaultStake: "10",
    rowStakes: {},
    accumulators: [],
  });
  const [rangeMode, setRangeMode] = useState<RangeMode>("90d");
  const [listenerError, setListenerError] = useState<string | null>(null);

  const matchesCollection = useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return collection(db, "users", uid, "matches");
  }, [uid]);

  const betsStateDoc = useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return doc(db, "users", uid, "appState", "bets");
  }, [uid]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!matchesCollection) {
      return;
    }

    const matchesQuery = query(matchesCollection, orderBy("date", "asc"));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const nextRows: MatchAnalyticsRow[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            date: String(data.date ?? ""),
            odds: String(data.odds ?? ""),
            winnerSide: data.winnerSide === "away" ? "away" : "home",
            actualWinnerSide:
              data.actualWinnerSide === "home" || data.actualWinnerSide === "away"
                ? data.actualWinnerSide
                : null,
          };
        });
        setRows(nextRows);
        setListenerError(null);
      },
      () => {
        setListenerError("Analytics data could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [matchesCollection]);

  useEffect(() => {
    if (!betsStateDoc) {
      return;
    }

    const unsubscribe = onSnapshot(
      betsStateDoc,
      (snapshot) => {
        if (!snapshot.exists()) {
          setBetsState({
            defaultStake: "10",
            rowStakes: {},
            accumulators: [],
          });
          return;
        }

        const data = snapshot.data();
        setBetsState({
          defaultStake: String(data.defaultStake ?? "10"),
          rowStakes: Object.fromEntries(
            Object.entries((data.rowStakes as Record<string, unknown>) ?? {}).map(
              ([key, value]) => [key, String(value ?? "")]
            )
          ),
          accumulators: Array.isArray(data.accumulators)
            ? (data.accumulators as Array<Record<string, unknown>>).map((acc, index) => ({
                id: String(acc.id ?? `acc-${index + 1}`),
                stake: String(acc.stake ?? "0"),
                matchIds: Array.isArray(acc.matchIds)
                  ? acc.matchIds.map((matchId) => String(matchId))
                  : [],
                day: acc.day ? String(acc.day) : null,
              }))
            : [],
        });
      },
      () => {
        setListenerError("Bets state could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [betsStateDoc]);

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

  const rangeLabel =
    rangeMode === "90d"
      ? "Last 3 months"
      : rangeMode === "30d"
        ? "Last 30 days"
        : "Last 7 days";

  return (
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
      <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
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
                    className="w-[170px]"
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
      </CardContent>
    </Card>
  );
}
