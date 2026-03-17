"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc as firestoreDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  NotebookPenIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import {
  formatDateDisplay,
  formatDateForInput,
  matchesDateFilter,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateFilterToolbar } from "@/components/ui/date-filter-toolbar";
import { SortableHeaderButton } from "@/components/ui/sortable-header-button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccumulatorLike } from "@/types/domain/bets";
import type { MatchBase } from "@/types/domain/match";
import type { DateFilterMode } from "@/types/filters";
import {
  buildAccumulatorName,
  buildAccumulatorNameMap,
  buildAccumulatorSummaries,
  reconcileAccumulatorsWithRows,
  serializeBetsState,
} from "@/components/bets/bets-utils";

type MatchBet = MatchBase;
type DailyAccumulator = AccumulatorLike & { note: string };

const initialAccumulator: DailyAccumulator = {
  id: "acc-1",
  name: "Accumulator 1",
  stake: "10",
  matchIds: [],
  day: null,
  note: "",
};

export function BetsCalculatorTable() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [rows, setRows] = useState<MatchBet[]>([]);
  const [defaultStake, setDefaultStake] = useState("10");
  const [rowStakes, setRowStakes] = useState<Record<string, string>>({});
  const [accumulators, setAccumulators] = useState<DailyAccumulator[]>([initialAccumulator]);
  const [activeAccumulatorId, setActiveAccumulatorId] = useState("acc-1");
  const [accumulatorError, setAccumulatorError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<DateFilterMode>("date");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [openNotePopoverId, setOpenNotePopoverId] = useState<string | null>(null);
  const [isBetsStateHydrated, setIsBetsStateHydrated] = useState(false);
  const lastSavedStateRef = useRef<string>("");

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
    return firestoreDoc(db, "users", uid, "appState", "bets");
  }, [uid]);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      if (!user) {
        setIsBetsStateHydrated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!betsStateDoc) {
      return;
    }

    const unsubscribe = onSnapshot(
      betsStateDoc,
      (snapshot) => {
        if (!snapshot.exists()) {
          const baseline = {
            defaultStake: "10",
            rowStakes: {},
            accumulators: [initialAccumulator],
            activeAccumulatorId: initialAccumulator.id,
          };
          lastSavedStateRef.current = serializeBetsState(baseline);
          setIsBetsStateHydrated(true);
          return;
        }

        const data = snapshot.data();
        const loadedDefaultStake = String(data.defaultStake ?? "10");
        const loadedRowStakes = Object.fromEntries(
          Object.entries((data.rowStakes as Record<string, unknown>) ?? {}).map(
            ([key, value]) => [key, String(value ?? "")]
          )
        );

        const loadedAccumulatorsRaw = Array.isArray(data.accumulators)
          ? (data.accumulators as Array<Record<string, unknown>>)
          : [];
        const loadedAccumulators: DailyAccumulator[] = loadedAccumulatorsRaw
          .map((item, index) => {
            const id = String(item.id ?? `acc-${index + 1}`);
            return {
              id,
              name: String(item.name ?? `Accumulator ${index + 1}`),
              stake: String(item.stake ?? loadedDefaultStake),
              matchIds: Array.isArray(item.matchIds)
                ? item.matchIds.map((matchId) => String(matchId))
                : [],
              day: item.day ? String(item.day) : null,
              note: String(item.note ?? ""),
            };
          })
          .filter((item) => item.id.length > 0);

        const safeAccumulators = loadedAccumulators.length
          ? loadedAccumulators
          : [initialAccumulator];
        const loadedActiveId = String(data.activeAccumulatorId ?? safeAccumulators[0].id);
        const safeActiveId = safeAccumulators.some((item) => item.id === loadedActiveId)
          ? loadedActiveId
          : safeAccumulators[0].id;

        setDefaultStake(loadedDefaultStake);
        setRowStakes(loadedRowStakes);
        setAccumulators(safeAccumulators);
        setNoteDrafts(
          Object.fromEntries(safeAccumulators.map((accumulator) => [accumulator.id, accumulator.note]))
        );
        setActiveAccumulatorId(safeActiveId);
        setAccumulatorError(null);

        const normalized = {
          defaultStake: loadedDefaultStake,
          rowStakes: loadedRowStakes,
          accumulators: safeAccumulators,
          activeAccumulatorId: safeActiveId,
        };
        lastSavedStateRef.current = serializeBetsState(normalized);
        setIsBetsStateHydrated(true);
      },
      () => {
        setIsBetsStateHydrated(true);
        setAccumulatorError("Bets state could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [betsStateDoc]);

  useEffect(() => {
    if (!matchesCollection) {
      return;
    }

    const matchesQuery = query(matchesCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
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
        setRowStakes((prev) => {
          const next: Record<string, string> = {};
          nextRows.forEach((row) => {
            next[row.id] = prev[row.id] ?? defaultStake;
          });
          return next;
        });
        setAccumulators((prev) => {
          const nextAccumulators = reconcileAccumulatorsWithRows(prev, nextRows, initialAccumulator);
          setActiveAccumulatorId((currentActiveId) =>
            nextAccumulators.some((item) => item.id === currentActiveId)
              ? currentActiveId
              : nextAccumulators[0].id
          );
          return nextAccumulators;
        });
        setAccumulatorError(null);
      },
      () => {
        setAccumulatorError("Matches could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [defaultStake, matchesCollection]);

  useEffect(() => {
    setNoteDrafts((prev) => {
      const next: Record<string, string> = {};
      accumulators.forEach((accumulator) => {
        next[accumulator.id] = prev[accumulator.id] ?? accumulator.note ?? "";
      });
      return next;
    });
  }, [accumulators]);

  useEffect(() => {
    if (!betsStateDoc || !isBetsStateHydrated) {
      return;
    }

    const payload = {
      defaultStake,
      rowStakes,
      accumulators,
      activeAccumulatorId,
    };
    const serialized = serializeBetsState(payload);
    if (serialized === lastSavedStateRef.current) {
      return;
    }

    setDoc(betsStateDoc, payload, { merge: true })
      .then(() => {
        lastSavedStateRef.current = serialized;
      })
      .catch(() => {
        // Ignore transient write errors; UI state remains available locally.
      });
  }, [
    activeAccumulatorId,
    accumulators,
    betsStateDoc,
    defaultStake,
    isBetsStateHydrated,
    rowStakes,
  ]);

  function getRowStake(rowId: string) {
    return Number(rowStakes[rowId] ?? defaultStake) || 0;
  }

  function createAccumulator() {
    const seedDay = filterDateSeed ?? formatDateForInput(new Date());
    const nextIndex =
      accumulators.filter((accumulator) => accumulator.day === seedDay).length + 1;
    const nextId = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nextAccumulator: DailyAccumulator = {
      id: nextId,
      name: buildAccumulatorName(seedDay, nextIndex),
      stake: "10",
      matchIds: [],
      day: seedDay,
      note: "",
    };
    setAccumulators((prev) => [...prev, nextAccumulator]);
    setNoteDrafts((prev) => ({ ...prev, [nextId]: "" }));
    setActiveAccumulatorId(nextId);
  }

  function removeAccumulator(id: string) {
    setAccumulators((prev) => {
      const next = prev.filter((accumulator) => accumulator.id !== id);
      return next.length
        ? next
        : [initialAccumulator];
    });
    if (activeAccumulatorId === id) {
      const fallback = accumulators.find((accumulator) => accumulator.id !== id);
      setActiveAccumulatorId(fallback?.id ?? "acc-1");
    }
    setOpenNotePopoverId((current) => (current === id ? null : current));
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function saveAccumulatorNote(accumulatorId: string) {
    const nextNote = noteDrafts[accumulatorId] ?? "";
    setAccumulators((prev) =>
      prev.map((accumulator) =>
        accumulator.id === accumulatorId ? { ...accumulator, note: nextNote } : accumulator
      )
    );
    setSavedNoteId(accumulatorId);
    setOpenNotePopoverId(null);
  }

  function clearAccumulatorNote(accumulatorId: string) {
    setNoteDrafts((prev) => ({
      ...prev,
      [accumulatorId]: "",
    }));
    setAccumulators((prev) =>
      prev.map((accumulator) =>
        accumulator.id === accumulatorId ? { ...accumulator, note: "" } : accumulator
      )
    );
    setSavedNoteId(accumulatorId);
    setOpenNotePopoverId(null);
  }

  function canToggleMatchForAccumulator(accumulator: DailyAccumulator, row: MatchBet) {
    if (accumulator.matchIds.includes(row.id)) {
      return true;
    }
    return !accumulator.day || accumulator.day === row.date;
  }

  function toggleMatchForAccumulator(accumulatorId: string, row: MatchBet) {
    setAccumulatorError(null);
    setAccumulators((prev) =>
      prev.map((accumulator) => {
        if (accumulator.id !== accumulatorId) {
          return accumulator;
        }

        if (accumulator.matchIds.includes(row.id)) {
          const nextMatchIds = accumulator.matchIds.filter((id) => id !== row.id);
          const nextDay = nextMatchIds.length > 0 ? accumulator.day : null;
          return {
            ...accumulator,
            matchIds: nextMatchIds,
            day: nextDay,
          };
        }

        if (accumulator.day && accumulator.day !== row.date) {
          setAccumulatorError("This accumulator is daily. Add fixtures from the same date only.");
          return accumulator;
        }

        return {
          ...accumulator,
          day: accumulator.day ?? row.date,
          matchIds: [...accumulator.matchIds, row.id],
        };
      })
    );
  }

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesDateFilter(row.date, filterMode, filterDate, filterDateRange)),
    [filterDate, filterDateRange, filterMode, rows]
  );

  const filterDateSeed = useMemo(() => {
    if (filterMode === "date" && filterDate) {
      return formatDateForInput(filterDate);
    }
    if (filterMode === "range" && filterDateRange?.from) {
      return formatDateForInput(filterDateRange.from);
    }
    return null;
  }, [filterDate, filterDateRange, filterMode]);

  const accumulatorNameById = useMemo(() => {
    return buildAccumulatorNameMap(accumulators);
  }, [accumulators]);

  const filteredActiveAccumulators = useMemo(
    () =>
      accumulators.filter((accumulator) => {
        // Unassigned accumulators can still be used for the current filter.
        if (!accumulator.day) {
          return true;
        }
        return matchesDateFilter(accumulator.day, filterMode, filterDate, filterDateRange);
      }),
    [accumulators, filterDate, filterDateRange, filterMode]
  );

  const resolvedActiveAccumulatorId = filteredActiveAccumulators.some(
    (accumulator) => accumulator.id === activeAccumulatorId
  )
    ? activeAccumulatorId
    : (filteredActiveAccumulators[0]?.id ?? null);

  const activeAccumulator = resolvedActiveAccumulatorId
    ? accumulators.find((accumulator) => accumulator.id === resolvedActiveAccumulatorId)
    : null;

  const accumulatorSummaries = useMemo(
    () => buildAccumulatorSummaries(accumulators, rows),
    [accumulators, rows]
  );

  const filteredAccumulatorSummaries = useMemo(
    () =>
      accumulatorSummaries.filter(
        (summary) =>
          Boolean(summary.day) &&
          matchesDateFilter(String(summary.day), filterMode, filterDate, filterDateRange)
      ),
    [accumulatorSummaries, filterDate, filterDateRange, filterMode]
  );

  function sortableHeader(
    label: string,
    column: {
      toggleSorting: (desc?: boolean) => void;
      getIsSorted: () => false | "asc" | "desc";
    }
  ) {
    return <SortableHeaderButton label={label} column={column} />;
  }

  const betColumns: ColumnDef<MatchBet>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => sortableHeader("Date", column),
      cell: ({ row }) => formatDateDisplay(row.original.date),
    },
    {
      id: "fixture",
      accessorFn: (row) => `${row.homeTeam} vs ${row.awayTeam}`,
      header: ({ column }) => sortableHeader("Fixture", column),
      cell: ({ row }) => (
        <span className="block truncate">
          {row.original.homeTeam} vs {row.original.awayTeam}
        </span>
      ),
    },
    {
      id: "betOn",
      accessorFn: (row) => (row.winnerSide === "away" ? row.awayTeam : row.homeTeam),
      header: ({ column }) => sortableHeader("Bet On", column),
      cell: ({ row }) => {
        const winnerName =
          row.original.winnerSide === "away" ? row.original.awayTeam : row.original.homeTeam;
        return <span className="block truncate text-emerald-600 dark:text-emerald-400">{winnerName}</span>;
      },
    },
    {
      id: "odds",
      accessorFn: (row) => Number(row.odds) || 0,
      header: ({ column }) => sortableHeader("Odds", column),
      cell: ({ row }) => row.original.odds,
    },
    {
      id: "stake",
      accessorFn: (row) => getRowStake(row.id),
      header: ({ column }) => sortableHeader("Stake", column),
      cell: ({ row }) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={rowStakes[row.original.id] ?? defaultStake}
          onChange={(event) =>
            setRowStakes((prev) => ({
              ...prev,
              [row.original.id]: event.target.value,
            }))
          }
          className="h-8"
        />
      ),
    },
    {
      id: "return",
      accessorFn: (row) => {
        const oddsValue = Number(row.odds) || 0;
        const stakeValue = getRowStake(row.id);
        return stakeValue * oddsValue;
      },
      header: ({ column }) => sortableHeader("Return", column),
      cell: ({ row }) => {
        const oddsValue = Number(row.original.odds) || 0;
        const stakeValue = getRowStake(row.original.id);
        return (stakeValue * oddsValue).toFixed(2);
      },
    },
    {
      id: "profit",
      accessorFn: (row) => {
        const oddsValue = Number(row.odds) || 0;
        const stakeValue = getRowStake(row.id);
        return stakeValue * oddsValue - stakeValue;
      },
      header: ({ column }) => sortableHeader("Profit", column),
      cell: ({ row }) => {
        const oddsValue = Number(row.original.odds) || 0;
        const stakeValue = getRowStake(row.original.id);
        return (stakeValue * oddsValue - stakeValue).toFixed(2);
      },
    },
    {
      id: "accumulator",
      accessorFn: (row) =>
        accumulators.filter((accumulator) => accumulator.matchIds.includes(row.id)).length,
      header: ({ column }) => sortableHeader("Accumulator", column),
      cell: ({ row }) => {
        const includedCount = accumulators.filter((accumulator) =>
          accumulator.matchIds.includes(row.original.id)
        ).length;

        if (accumulators.length <= 1) {
          const target = accumulators[0];
          if (!target) {
            return null;
          }
          const checked = target.matchIds.includes(row.original.id);
          return (
            <Button
              type="button"
              size="sm"
              variant={checked ? "default" : "outline"}
              onClick={() => toggleMatchForAccumulator(target.id, row.original)}
              disabled={!canToggleMatchForAccumulator(target, row.original)}
            >
              {checked ? "Added" : "Add"}
            </Button>
          );
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="sm" variant={includedCount > 0 ? "default" : "outline"}>
                  {includedCount > 0 ? `Added (${includedCount})` : "Add"}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Choose accumulators</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accumulators.map((accumulator) => {
                  const checked = accumulator.matchIds.includes(row.original.id);
                  const canToggle = canToggleMatchForAccumulator(accumulator, row.original);
                  return (
                    <DropdownMenuCheckboxItem
                      key={accumulator.id}
                      checked={checked}
                      disabled={!checked && !canToggle}
                      onCheckedChange={() =>
                        toggleMatchForAccumulator(accumulator.id, row.original)
                      }
                    >
                      {accumulatorNameById[accumulator.id] ?? accumulator.name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const betsTable = useReactTable({
    data: filteredRows,
    columns: betColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  function getBetColumnWidthClass(columnId: string) {
    switch (columnId) {
      case "date":
        return "w-[9rem]";
      case "fixture":
        return "w-[18rem]";
      case "betOn":
        return "w-[10rem]";
      case "odds":
        return "w-[6rem]";
      case "stake":
        return "w-[8rem]";
      case "return":
        return "w-[10rem]";
      case "profit":
        return "w-[8rem]";
      case "accumulator":
        return "w-[12rem]";
      default:
        return "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DateFilterToolbar
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          filterDate={filterDate}
          onFilterDateChange={setFilterDate}
          filterDateRange={filterDateRange}
          onFilterDateRangeChange={setFilterDateRange}
          onClear={() => {
            setFilterDate(undefined);
            setFilterDateRange(undefined);
          }}
        />
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

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Active Accumulator</Label>
            {filteredActiveAccumulators.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No active accumulators for this date filter.
              </span>
            ) : (
              filteredActiveAccumulators.map((accumulator) => (
                <Button
                  key={accumulator.id}
                  type="button"
                  size="sm"
                  variant={resolvedActiveAccumulatorId === accumulator.id ? "default" : "outline"}
                  onClick={() => setActiveAccumulatorId(accumulator.id)}
                >
                  {accumulatorNameById[accumulator.id] ?? accumulator.name}
                </Button>
              ))
            )}
            <Button type="button" size="sm" variant="secondary" onClick={createAccumulator}>
              Add Accumulator
            </Button>
          </div>
          {activeAccumulator?.day ? (
            <p className="text-xs text-muted-foreground">
              {(accumulatorNameById[activeAccumulator.id] ?? activeAccumulator.name)} day:{" "}
              {formatDateDisplay(activeAccumulator.day)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a fixture to set the day for{" "}
              {activeAccumulator
                ? (accumulatorNameById[activeAccumulator.id] ?? activeAccumulator.name)
                : "active accumulator"}
              .
            </p>
          )}
          {accumulatorError ? <p className="text-xs text-destructive">{accumulatorError}</p> : null}
        </div>

        <Table className="table-fixed">
          <TableHeader>
            {betsTable.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={getBetColumnWidthClass(header.column.id)}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {betsTable.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-4 text-muted-foreground">
                  No fixtures yet. Add rows in Matches first.
                </TableCell>
              </TableRow>
            ) : (
              betsTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        getBetColumnWidthClass(cell.column.id),
                        (cell.column.id === "fixture" || cell.column.id === "betOn") && "truncate"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="space-y-3 rounded-md border p-4">
          <h3 className="text-sm font-medium">Daily Accumulators</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[10rem]">Name</TableHead>
                <TableHead className="w-[9rem]">Day</TableHead>
                <TableHead className="w-[12rem]">Stake</TableHead>
                <TableHead className="w-[6rem]">Games</TableHead>
                <TableHead className="w-[10rem]">Combined Odds</TableHead>
                <TableHead className="w-[10rem]">Return</TableHead>
                <TableHead className="w-[10rem]">Profit</TableHead>
                <TableHead className="w-[4rem]">Note</TableHead>
                <TableHead className="w-[10rem]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccumulatorSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-4 text-muted-foreground">
                    No accumulators match this date filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccumulatorSummaries.map((summary) => (
                  <TableRow key={summary.id}>
                    <TableCell>{accumulatorNameById[summary.id] ?? summary.name}</TableCell>
                    <TableCell>{summary.day ? formatDateDisplay(summary.day) : "-"}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={summary.stake}
                        onChange={(event) =>
                          setAccumulators((prev) =>
                            prev.map((accumulator) =>
                              accumulator.id === summary.id
                                ? { ...accumulator, stake: event.target.value }
                                : accumulator
                            )
                          )
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>{summary.matches.length}</TableCell>
                    <TableCell>
                      {summary.matches.length ? summary.combinedOdds.toFixed(2) : "0.00"}
                    </TableCell>
                    <TableCell>
                      {summary.matches.length ? summary.potentialReturn.toFixed(2) : "0.00"}
                    </TableCell>
                    <TableCell>{summary.matches.length ? summary.profit.toFixed(2) : "0.00"}</TableCell>
                    <TableCell>
                      <Popover
                        open={openNotePopoverId === summary.id}
                        onOpenChange={(open) => {
                          setOpenNotePopoverId(open ? summary.id : null);
                        }}
                      >
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-sm"
                              variant={summary.note?.trim() ? "default" : "outline"}
                            >
                              <NotebookPenIcon className="size-4" />
                              <span className="sr-only">Edit accumulator note</span>
                            </Button>
                          }
                        />
                        <PopoverContent align="end" className="w-80 p-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                              {accumulatorNameById[summary.id] ?? summary.name} note
                            </Label>
                            <textarea
                              value={noteDrafts[summary.id] ?? ""}
                              onChange={(event) => {
                                setSavedNoteId((current) =>
                                  current === summary.id ? null : current
                                );
                                setNoteDrafts((prev) => ({
                                  ...prev,
                                  [summary.id]: event.target.value,
                                }));
                              }}
                              placeholder="Add notes for this accumulator..."
                              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {savedNoteId === summary.id ? "Saved" : " "}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => clearAccumulatorNote(summary.id)}
                                  disabled={
                                    (noteDrafts[summary.id] ?? "").trim().length === 0 &&
                                    (summary.note ?? "").trim().length === 0
                                  }
                                >
                                  Clear
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => saveAccumulatorNote(summary.id)}
                                >
                                  Save note
                                </Button>
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAccumulators((prev) =>
                              prev.map((accumulator) =>
                                accumulator.id === summary.id
                                  ? { ...accumulator, matchIds: [], day: null }
                                  : accumulator
                              )
                            )
                          }
                          disabled={summary.matches.length === 0}
                        >
                          Clear
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => removeAccumulator(summary.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredAccumulatorSummaries.some((summary) => summary.matches.length > 0) ? (
            filteredAccumulatorSummaries.map((summary) =>
              summary.matches.length ? (
                <p key={summary.id} className="text-xs text-muted-foreground">
                  {accumulatorNameById[summary.id] ?? summary.name}:{" "}
                  {summary.matches.map((row) => `${row.homeTeam} vs ${row.awayTeam}`).join(" | ")}
                </p>
              ) : null
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Add games to an accumulator to preview total return.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

