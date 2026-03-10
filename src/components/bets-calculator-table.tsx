"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MatchBet = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  winnerSide: "home" | "away";
  odds: string;
};

function formatDateDisplay(value: string) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BetsCalculatorTable() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [rows, setRows] = useState<MatchBet[]>([]);
  const [defaultStake, setDefaultStake] = useState("10");
  const [rowStakes, setRowStakes] = useState<Record<string, string>>({});
  const [accumulatorStake, setAccumulatorStake] = useState("10");
  const [accumulatorIds, setAccumulatorIds] = useState<string[]>([]);

  const accumulatorStakeValue = Number(accumulatorStake) || 0;

  const matchesCollection = useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return collection(db, "users", uid, "matches");
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

    const matchesQuery = query(matchesCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(matchesQuery, (snapshot) => {
      const nextRows: MatchBet[] = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          date: String(data.date ?? ""),
          homeTeam: String(data.homeTeam ?? ""),
          awayTeam: String(data.awayTeam ?? ""),
          winnerSide: data.winnerSide === "away" ? "away" : "home",
          odds: String(data.odds ?? ""),
        };
      });
      setRows(nextRows);
      setAccumulatorIds((prev) => prev.filter((id) => nextRows.some((r) => r.id === id)));
      setRowStakes((prev) => {
        const next: Record<string, string> = {};
        nextRows.forEach((row) => {
          next[row.id] = prev[row.id] ?? defaultStake;
        });
        return next;
      });
    });

    return () => unsubscribe();
  }, [defaultStake, matchesCollection]);

  function getRowStake(rowId: string) {
    return Number(rowStakes[rowId] ?? defaultStake) || 0;
  }

  function toggleAccumulator(rowId: string) {
    setAccumulatorIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  }

  const accumulatorRows = rows.filter((row) => accumulatorIds.includes(row.id));
  const combinedOdds = accumulatorRows.reduce((total, row) => {
    const parsed = Number(row.odds);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return total;
    }
    return total * parsed;
  }, 1);
  const accumulatorReturn =
    accumulatorRows.length > 0 ? accumulatorStakeValue * combinedOdds : 0;
  const accumulatorProfit = accumulatorReturn - accumulatorStakeValue;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="defaultStake">Default Stake</Label>
          <Input
            id="defaultStake"
            type="number"
            min="0"
            step="0.01"
            value={defaultStake}
            onChange={(event) => setDefaultStake(event.target.value)}
          />
        </div>

        {!isFirebaseConfigured ? (
          <p className="text-sm text-muted-foreground">
            Firebase is not configured.
          </p>
        ) : null}

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[9rem]">Date</TableHead>
              <TableHead className="w-[18rem]">Fixture</TableHead>
              <TableHead className="w-[10rem]">Bet On</TableHead>
              <TableHead className="w-[6rem]">Odds</TableHead>
              <TableHead className="w-[8rem]">Stake</TableHead>
              <TableHead className="w-[10rem]">Return</TableHead>
              <TableHead className="w-[8rem]">Profit</TableHead>
              <TableHead className="w-[9rem]">Accumulator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-4 text-muted-foreground">
                  No fixtures yet. Add rows in Matches first.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const oddsValue = Number(row.odds) || 0;
                const stakeValue = getRowStake(row.id);
                const potentialReturn = stakeValue * oddsValue;
                const profit = potentialReturn - stakeValue;
                const winnerName =
                  row.winnerSide === "away" ? row.awayTeam : row.homeTeam;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateDisplay(row.date)}</TableCell>
                    <TableCell className="truncate">
                      {row.homeTeam} vs {row.awayTeam}
                    </TableCell>
                    <TableCell className="truncate text-emerald-600 dark:text-emerald-400">
                      {winnerName}
                    </TableCell>
                    <TableCell>{row.odds}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rowStakes[row.id] ?? defaultStake}
                        onChange={(event) =>
                          setRowStakes((prev) => ({
                            ...prev,
                            [row.id]: event.target.value,
                          }))
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>{potentialReturn.toFixed(2)}</TableCell>
                    <TableCell>{profit.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant={accumulatorIds.includes(row.id) ? "default" : "outline"}
                        onClick={() => toggleAccumulator(row.id)}
                      >
                        {accumulatorIds.includes(row.id) ? "Added" : "Add"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="space-y-3 rounded-md border p-4">
          <h3 className="text-sm font-medium">Accumulator</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[12rem]">Stake</TableHead>
                <TableHead className="w-[6rem]">Games</TableHead>
                <TableHead className="w-[10rem]">Combined Odds</TableHead>
                <TableHead className="w-[10rem]">Return</TableHead>
                <TableHead className="w-[10rem]">Profit</TableHead>
                <TableHead className="w-[8rem]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Input
                    id="accumulatorStake"
                    type="number"
                    min="0"
                    step="0.01"
                    value={accumulatorStake}
                    onChange={(event) => setAccumulatorStake(event.target.value)}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>{accumulatorRows.length}</TableCell>
                <TableCell>
                  {accumulatorRows.length ? combinedOdds.toFixed(2) : "0.00"}
                </TableCell>
                <TableCell>
                  {accumulatorRows.length ? accumulatorReturn.toFixed(2) : "0.00"}
                </TableCell>
                <TableCell>
                  {accumulatorRows.length ? accumulatorProfit.toFixed(2) : "0.00"}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAccumulatorIds([])}
                    disabled={accumulatorRows.length === 0}
                  >
                    Clear
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {accumulatorRows.length ? (
            <p className="text-xs text-muted-foreground">
              {accumulatorRows
                .map((row) => `${row.homeTeam} vs ${row.awayTeam}`)
                .join(" | ")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add games to accumulator to preview total return.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
