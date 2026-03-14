"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
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

type MatchRow = {
  id: string;
  date: string;
  odds: string;
  winnerSide: "home" | "away";
  actualWinnerSide: "home" | "away" | "draw" | null;
};

type PersistedAccumulator = {
  stake: string;
  matchIds: string[];
  day: string | null;
};

type BetsState = {
  defaultStake: string;
  rowStakes: Record<string, string>;
  accumulators: PersistedAccumulator[];
};

type ProfitRow = {
  date: string;
  profit: number;
  spent: number;
  received: number;
};

type RangeMode = "7d" | "30d" | "90d";

const chartConfig = {
  profit: {
    label: "Total Profit",
    color: "var(--chart-3)",
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
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTick(value: string) {
  const date = parseDateKey(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
}

export function AnalyticsTotalProfitAreaChart() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
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
    const unsubscribe = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
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
        const nextRows: MatchRow[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            date: String(data.date ?? ""),
            odds: String(data.odds ?? "0"),
            winnerSide: data.winnerSide === "away" ? "away" : "home",
            actualWinnerSide:
              data.actualWinnerSide === "home" ||
              data.actualWinnerSide === "away" ||
              data.actualWinnerSide === "draw"
                ? data.actualWinnerSide
                : null,
          };
        });
        setMatches(nextRows);
        setListenerError(null);
      },
      () => {
        setListenerError("Totals data could not be loaded due to Firestore permissions.");
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
          setBetsState({ defaultStake: "10", rowStakes: {}, accumulators: [] });
          return;
        }
        const data = snapshot.data();
        setBetsState({
          defaultStake: String(data.defaultStake ?? "10"),
          rowStakes: Object.fromEntries(
            Object.entries((data.rowStakes as Record<string, unknown>) ?? {}).map(([k, v]) => [
              k,
              String(v ?? ""),
            ])
          ),
          accumulators: Array.isArray(data.accumulators)
            ? (data.accumulators as Array<Record<string, unknown>>).map((acc) => ({
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
        setListenerError("Bet state could not be loaded due to Firestore permissions.");
      }
    );
    return () => unsubscribe();
  }, [betsStateDoc]);

  const fullProfitData = useMemo<ProfitRow[]>(() => {
    const byDate = new Map<string, ProfitRow>();
    const matchesById = new Map(matches.map((row) => [row.id, row]));

    matches.forEach((row) => {
      if (!row.date) {
        return;
      }
      const stake = Number(
        betsState.rowStakes[row.id] && betsState.rowStakes[row.id] !== ""
          ? betsState.rowStakes[row.id]
          : betsState.defaultStake
      );
      if (!Number.isFinite(stake) || stake <= 0) {
        return;
      }

      const odds = Number(row.odds);
      const won = row.actualWinnerSide !== null && row.actualWinnerSide === row.winnerSide;
      const received = won && Number.isFinite(odds) && odds > 0 ? stake * odds : 0;

      const current = byDate.get(row.date) ?? { date: row.date, spent: 0, received: 0, profit: 0 };
      current.spent += stake;
      current.received += received;
      current.profit = current.received - current.spent;
      byDate.set(row.date, current);
    });

    betsState.accumulators.forEach((accumulator) => {
      const stake = Number(accumulator.stake);
      if (!Number.isFinite(stake) || stake <= 0 || !accumulator.matchIds.length) {
        return;
      }

      const selected = accumulator.matchIds
        .map((id) => matchesById.get(id))
        .filter((m): m is MatchRow => Boolean(m));
      if (!selected.length) {
        return;
      }

      const day = accumulator.day ?? selected[0].date;
      if (!day) {
        return;
      }

      let allWon = true;
      let combinedOdds = 1;
      for (const row of selected) {
        const odds = Number(row.odds);
        const won = row.actualWinnerSide !== null && row.actualWinnerSide === row.winnerSide;
        if (!won || !Number.isFinite(odds) || odds <= 0) {
          allWon = false;
          break;
        }
        combinedOdds *= odds;
      }

      const received = allWon ? stake * combinedOdds : 0;
      const current = byDate.get(day) ?? { date: day, spent: 0, received: 0, profit: 0 };
      current.spent += stake;
      current.received += received;
      current.profit = current.received - current.spent;
      byDate.set(day, current);
    });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [betsState, matches]);

  const chartData = useMemo(() => {
    const days = rangeMode === "7d" ? 7 : rangeMode === "30d" ? 30 : 90;
    const maxDate = fullProfitData.at(-1)?.date;
    const endDate = maxDate ? parseDateKey(maxDate) : null;
    if (!endDate) {
      return [];
    }

    const byDate = new Map(fullProfitData.map((row) => [row.date, row]));
    const next: ProfitRow[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const current = new Date(endDate);
      current.setDate(endDate.getDate() - offset);
      const key = toDateKey(current);
      next.push(byDate.get(key) ?? { date: key, spent: 0, received: 0, profit: 0 });
    }
    return next;
  }, [fullProfitData, rangeMode]);

  const totalProfit = useMemo(
    () => chartData.reduce((sum, row) => sum + row.profit, 0),
    [chartData]
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) {
      return [-1, 1];
    }
    const values = chartData
      .map((row) => row.profit)
      .filter((value) => Number.isFinite(value));
    if (!values.length) {
      return [-1, 1];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding =
      min === max
        ? Math.max(1, Math.abs(min) * 0.1)
        : Math.max(1, (max - min) * 0.1);
    return [min - padding, max + padding];
  }, [chartData]);

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
          <CardTitle>Total Profit - Interactive Area</CardTitle>
          <CardDescription>
            Total profit trend for the selected period ({formatCurrency(totalProfit)}).
          </CardDescription>
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
            <DropdownMenuItem onClick={() => setRangeMode("90d")}>Last 3 months</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRangeMode("30d")}>Last 30 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRangeMode("7d")}>Last 7 days</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="px-2 pt-4 pb-6 sm:px-6 sm:pt-6">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {listenerError ?? "No totals data yet. Add matches, bets, and results first."}
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[360px] w-full">
            <AreaChart
              data={chartData}
              margin={{
                left: 8,
                right: 16,
                top: 36,
                bottom: 8,
              }}
            >
              <defs>
                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.75} />
                  <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={formatDateTick}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={90}
                domain={yDomain}
                tickFormatter={(value) => formatCurrency(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatDateDisplay(String(value))}
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                  />
                }
              />
              <Legend />
              <Area
                dataKey="profit"
                type="natural"
                fill="url(#fillProfit)"
                stroke="var(--color-profit)"
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

