"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  XIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type MatchResultRow = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  winnerSide: "home" | "away";
  actualWinnerSide: "home" | "away" | null;
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

export function MatchResultsTable() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [rows, setRows] = useState<MatchResultRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<"date" | "range">("date");

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
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const nextRows: MatchResultRow[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            date: String(data.date ?? ""),
            homeTeam: String(data.homeTeam ?? ""),
            awayTeam: String(data.awayTeam ?? ""),
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
        setListenerError("Results could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [matchesCollection]);

  async function setActualWinner(matchId: string, side: "home" | "away") {
    if (!matchesCollection) {
      return;
    }

    setUpdatingId(matchId);
    try {
      await updateDoc(doc(matchesCollection, matchId), {
        actualWinnerSide: side,
      });
    } finally {
      setUpdatingId(null);
    }
  }

  function getPredictedWinner(row: MatchResultRow) {
    return row.winnerSide === "away" ? row.awayTeam || "Away Team" : row.homeTeam || "Home Team";
  }

  function getActualWinner(row: MatchResultRow) {
    if (row.actualWinnerSide === "away") {
      return row.awayTeam || "Away Team";
    }
    if (row.actualWinnerSide === "home") {
      return row.homeTeam || "Home Team";
    }
    return "Not set";
  }

  function getPredictionResult(row: MatchResultRow) {
    if (!row.actualWinnerSide) {
      return "Not set";
    }
    return row.actualWinnerSide === row.winnerSide ? "Successful" : "Unsuccessful";
  }

  function formatDateForInput(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseStoredDate(value: string) {
    if (!value) {
      return null;
    }

    const parts = value.split("-");
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const parsed = new Date(year, month - 1, day);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function endOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
  }

  const filteredRows = useMemo(() => {
    if (filterMode === "date" && !filterDate) {
      return rows;
    }

    if (filterMode === "range" && !filterDateRange?.from && !filterDateRange?.to) {
      return rows;
    }

    return rows.filter((row) => {
      const rowDate = parseStoredDate(row.date);
      if (!rowDate) {
        return false;
      }

      if (filterMode === "range" && (filterDateRange?.from || filterDateRange?.to)) {
        const from = filterDateRange?.from ? startOfDay(filterDateRange.from) : null;
        const to = filterDateRange?.to ? endOfDay(filterDateRange.to) : from;
        if (from && rowDate < from) {
          return false;
        }
        if (to && rowDate > to) {
          return false;
        }
        return true;
      }

      if (filterMode === "date" && filterDate) {
        const target = formatDateForInput(filterDate);
        return row.date === target;
      }

      return true;
    });
  }, [filterDate, filterDateRange, filterMode, rows]);

  function renderSortIcon(sortState: false | "asc" | "desc") {
    if (sortState === "asc") {
      return <ArrowUpIcon className="size-4" />;
    }
    if (sortState === "desc") {
      return <ArrowDownIcon className="size-4" />;
    }
    return <ArrowUpDownIcon className="size-4 opacity-60" />;
  }

  const columns: ColumnDef<MatchResultRow>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => formatDateDisplay(row.original.date),
    },
    {
      id: "fixture",
      accessorFn: (row) => `${row.homeTeam} vs ${row.awayTeam}`,
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fixture
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => (
        <span className="block truncate">
          {row.original.homeTeam} vs {row.original.awayTeam}
        </span>
      ),
    },
    {
      id: "predictedWinner",
      accessorFn: (row) => getPredictedWinner(row),
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Predicted Winner
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => (
        <span className="block truncate text-emerald-600 dark:text-emerald-400">
          {getPredictedWinner(row.original)}
        </span>
      ),
    },
    {
      id: "actualWinner",
      accessorFn: (row) => getActualWinner(row),
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Actual Winner
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={row.original.actualWinnerSide === "home" ? "default" : "outline"}
            className={cn(
              "min-w-[7rem] justify-start",
              row.original.actualWinnerSide === "home" &&
                "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            onClick={() => setActualWinner(row.original.id, "home")}
            disabled={updatingId === row.original.id}
          >
            {row.original.homeTeam || "Home Team"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={row.original.actualWinnerSide === "away" ? "default" : "outline"}
            className={cn(
              "min-w-[7rem] justify-start",
              row.original.actualWinnerSide === "away" &&
                "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            onClick={() => setActualWinner(row.original.id, "away")}
            disabled={updatingId === row.original.id}
          >
            {row.original.awayTeam || "Away Team"}
          </Button>
        </div>
      ),
    },
    {
      id: "predictionResult",
      accessorFn: (row) => getPredictionResult(row),
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Prediction Result
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => {
        const predictionResult = getPredictionResult(row.original);
        return row.original.actualWinnerSide ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-2.5 rounded-full",
                predictionResult === "Successful" ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            <span className="text-sm">{predictionResult}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Not set</span>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  function getColumnWidthClass(columnId: string) {
    switch (columnId) {
      case "date":
        return "w-[9rem]";
      case "fixture":
        return "w-[18rem]";
      case "predictedWinner":
        return "w-[11rem]";
      case "actualWinner":
        return "w-[18rem]";
      case "predictionResult":
        return "w-[10rem]";
      default:
        return "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Filter Mode</Label>
            <div className="inline-flex rounded-md border p-1">
              <Button
                type="button"
                size="sm"
                variant={filterMode === "date" ? "default" : "ghost"}
                onClick={() => setFilterMode("date")}
              >
                Date
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterMode === "range" ? "default" : "ghost"}
                onClick={() => setFilterMode("range")}
              >
                Range
              </Button>
            </div>
          </div>
          {filterMode === "date" ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-[180px] justify-start font-normal",
                        !filterDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="size-4" />
                      {filterDate
                        ? formatDateDisplay(formatDateForInput(filterDate))
                        : "Pick date"}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar mode="single" selected={filterDate} onSelect={(date) => setFilterDate(date ?? undefined)} />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Range</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-[260px] justify-start font-normal",
                        !filterDateRange?.from && !filterDateRange?.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="size-4" />
                      {filterDateRange?.from
                        ? filterDateRange.to
                          ? `${formatDateDisplay(
                              formatDateForInput(filterDateRange.from)
                            )} - ${formatDateDisplay(formatDateForInput(filterDateRange.to))}`
                          : formatDateDisplay(formatDateForInput(filterDateRange.from))
                        : "Pick date range"}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="range"
                    selected={filterDateRange}
                    onSelect={(range) => setFilterDateRange(range)}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              setFilterDate(undefined);
              setFilterDateRange(undefined);
            }}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Clear date filters</span>
          </Button>
        </div>
        {!isFirebaseConfigured ? (
          <p className="text-sm text-muted-foreground">Firebase is not configured.</p>
        ) : null}
        {listenerError ? <p className="text-sm text-destructive">{listenerError}</p> : null}

        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={getColumnWidthClass(header.column.id)}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-muted-foreground">
                  No fixtures yet. Add rows in Matches first.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={getColumnWidthClass(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
