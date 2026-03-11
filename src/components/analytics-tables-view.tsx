"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import type { DateRange } from "react-day-picker";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MatchRow = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  country: string;
  winnerPercent: string;
  winnerSide: "home" | "away";
  actualWinnerSide: "home" | "away" | null;
  odds: string;
};

type PersistedAccumulator = {
  id: string;
  name: string;
  stake: string;
  matchIds: string[];
  day: string | null;
};

type BetsState = {
  defaultStake: string;
  rowStakes: Record<string, string>;
  accumulators: PersistedAccumulator[];
};

type AnalyticsTableRow = {
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
  singleStake: number;
  singleReturn: number;
  singleProfit: number;
  accumulatorCount: number;
};

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

function formatDateDisplay(value: string) {
  const date = parseDateKey(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number) {
  return `€${value.toFixed(2)}`;
}

export function AnalyticsTablesView() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [betsState, setBetsState] = useState<BetsState>({
    defaultStake: "10",
    rowStakes: {},
    accumulators: [],
  });
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [filterMode, setFilterMode] = useState<"date" | "range">("date");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

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

    const matchesQuery = query(matchesCollection, orderBy("date", "desc"));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const next: MatchRow[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            date: String(data.date ?? ""),
            homeTeam: String(data.homeTeam ?? ""),
            awayTeam: String(data.awayTeam ?? ""),
            competition: String(data.competition ?? ""),
            country: String(data.country ?? ""),
            winnerPercent: String(data.winnerPercent ?? "0"),
            winnerSide: data.winnerSide === "away" ? "away" : "home",
            actualWinnerSide:
              data.actualWinnerSide === "home" || data.actualWinnerSide === "away"
                ? data.actualWinnerSide
                : null,
            odds: String(data.odds ?? "0"),
          };
        });
        setMatches(next);
        setListenerError(null);
      },
      () => setListenerError("Analytics table data could not be loaded due to Firestore permissions.")
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
            ? (data.accumulators as Array<Record<string, unknown>>).map((acc, index) => ({
                id: String(acc.id ?? `acc-${index + 1}`),
                name: String(acc.name ?? `Accumulator ${index + 1}`),
                stake: String(acc.stake ?? "0"),
                matchIds: Array.isArray(acc.matchIds)
                  ? acc.matchIds.map((matchId) => String(matchId))
                  : [],
                day: acc.day ? String(acc.day) : null,
              }))
            : [],
        });
      },
      () => setListenerError("Bet state could not be loaded due to Firestore permissions.")
    );

    return () => unsubscribe();
  }, [betsStateDoc]);

  const tableRows = useMemo<AnalyticsTableRow[]>(() => {
    const counts = new Map<string, number>();
    betsState.accumulators.forEach((acc) => {
      acc.matchIds.forEach((matchId) => {
        counts.set(matchId, (counts.get(matchId) ?? 0) + 1);
      });
    });

    return matches.map((row) => {
      const predictedWinner = row.winnerSide === "away" ? row.awayTeam : row.homeTeam;
      const actualWinner =
        row.actualWinnerSide === null
          ? "Pending"
          : row.actualWinnerSide === "away"
            ? row.awayTeam
            : row.homeTeam;
      const outcome: AnalyticsTableRow["outcome"] =
        row.actualWinnerSide === null
          ? "Pending"
          : row.actualWinnerSide === row.winnerSide
            ? "Win"
            : "Loss";
      const odds = Number(row.odds) || 0;
      const singleStake = Number(
        betsState.rowStakes[row.id] && betsState.rowStakes[row.id] !== ""
          ? betsState.rowStakes[row.id]
          : betsState.defaultStake
      ) || 0;
      const singleReturn = outcome === "Win" ? singleStake * odds : 0;
      const singleProfit = singleReturn - singleStake;

      return {
        id: row.id,
        date: row.date,
        fixture: `${row.homeTeam} vs ${row.awayTeam}`,
        competition: row.competition,
        country: row.country,
        predictedWinner,
        actualWinner,
        outcome,
        winPercent: Number(row.winnerPercent) || 0,
        odds,
        singleStake,
        singleReturn,
        singleProfit,
        accumulatorCount: counts.get(row.id) ?? 0,
      };
    });
  }, [betsState, matches]);

  const dateFilteredRows = useMemo(() => {
    if (filterMode === "date" && !filterDate) {
      return tableRows;
    }
    if (filterMode === "range" && !filterDateRange?.from && !filterDateRange?.to) {
      return tableRows;
    }

    return tableRows.filter((row) => {
      const rowDate = parseDateKey(row.date);
      if (!rowDate) {
        return false;
      }

      if (filterMode === "date" && filterDate) {
        return row.date === formatDateForInput(filterDate);
      }

      if (filterMode === "range" && (filterDateRange?.from || filterDateRange?.to)) {
        const from = filterDateRange?.from
          ? new Date(
              filterDateRange.from.getFullYear(),
              filterDateRange.from.getMonth(),
              filterDateRange.from.getDate()
            )
          : null;
        const toRaw = filterDateRange?.to ?? filterDateRange?.from ?? null;
        const to = toRaw
          ? new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999)
          : null;
        if (from && rowDate < from) {
          return false;
        }
        if (to && rowDate > to) {
          return false;
        }
      }

      return true;
    });
  }, [filterDate, filterDateRange, filterMode, tableRows]);

  function sortHeader(
    label: string,
    column: {
      toggleSorting: (desc?: boolean) => void;
      getIsSorted: () => false | "asc" | "desc";
    }
  ) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {label}
        {column.getIsSorted() === "asc" ? (
          <ArrowUpIcon className="size-4" />
        ) : column.getIsSorted() === "desc" ? (
          <ArrowDownIcon className="size-4" />
        ) : (
          <ArrowUpDownIcon className="size-4 opacity-60" />
        )}
      </Button>
    );
  }

  const columns: ColumnDef<AnalyticsTableRow>[] = [
    { accessorKey: "date", header: ({ column }) => sortHeader("Date", column), cell: ({ row }) => formatDateDisplay(row.original.date) },
    { accessorKey: "fixture", header: ({ column }) => sortHeader("Fixture", column) },
    { accessorKey: "competition", header: ({ column }) => sortHeader("Competition", column) },
    { accessorKey: "country", header: ({ column }) => sortHeader("Country", column) },
    { accessorKey: "predictedWinner", header: ({ column }) => sortHeader("Predicted", column) },
    { accessorKey: "actualWinner", header: ({ column }) => sortHeader("Actual", column) },
    {
      accessorKey: "outcome",
      header: ({ column }) => sortHeader("Outcome", column),
      cell: ({ row }) => (
        <span
          className={cn(
            "font-medium",
            row.original.outcome === "Win" && "text-emerald-600 dark:text-emerald-400",
            row.original.outcome === "Loss" && "text-red-600 dark:text-red-400",
            row.original.outcome === "Pending" && "text-muted-foreground"
          )}
        >
          {row.original.outcome}
        </span>
      ),
    },
    {
      accessorKey: "winPercent",
      header: ({ column }) => sortHeader("Win %", column),
      cell: ({ row }) => `${row.original.winPercent.toFixed(2)}%`,
    },
    { accessorKey: "odds", header: ({ column }) => sortHeader("Odds", column), cell: ({ row }) => row.original.odds.toFixed(2) },
    {
      accessorKey: "singleStake",
      header: ({ column }) => sortHeader("Stake", column),
      cell: ({ row }) => formatCurrency(row.original.singleStake),
    },
    {
      accessorKey: "singleReturn",
      header: ({ column }) => sortHeader("Return", column),
      cell: ({ row }) => formatCurrency(row.original.singleReturn),
    },
    {
      accessorKey: "singleProfit",
      header: ({ column }) => sortHeader("Profit", column),
      cell: ({ row }) => (
        <span
          className={cn(
            row.original.singleProfit >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {formatCurrency(row.original.singleProfit)}
        </span>
      ),
    },
    {
      accessorKey: "accumulatorCount",
      header: ({ column }) => sortHeader("Accumulators", column),
    },
  ];

  const table = useReactTable({
    data: dateFilteredRows,
    columns,
    state: { globalFilter, sorting, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue).toLowerCase();
      const values = [
        row.original.date,
        row.original.fixture,
        row.original.competition,
        row.original.country,
        row.original.predictedWinner,
        row.original.actualWinner,
        row.original.outcome,
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    },
    initialState: {
      pagination: { pageSize: 15 },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics Table</CardTitle>
        <CardDescription>Comprehensive game outcomes and betting performance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Filter Mode</Label>
            <div className="inline-flex rounded-md border p-1">
              <Button type="button" size="sm" variant={filterMode === "date" ? "default" : "ghost"} onClick={() => setFilterMode("date")}>Date</Button>
              <Button type="button" size="sm" variant={filterMode === "range" ? "default" : "ghost"} onClick={() => setFilterMode("range")}>Range</Button>
            </div>
          </div>

          {filterMode === "date" ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="w-[180px] justify-start font-normal">
                      <CalendarIcon className="size-4" />
                      {filterDate ? formatDateDisplay(formatDateForInput(filterDate)) : "Pick date"}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto p-0" initialFocus={false}>
                  <Calendar mode="single" selected={filterDate} onSelect={(date) => setFilterDate(date ?? undefined)} />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Range</Label>
              <Popover modal={false}>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="w-[260px] justify-start font-normal">
                      <CalendarIcon className="size-4" />
                      {filterDateRange?.from
                        ? filterDateRange.to
                          ? `${formatDateDisplay(formatDateForInput(filterDateRange.from))} - ${formatDateDisplay(formatDateForInput(filterDateRange.to))}`
                          : formatDateDisplay(formatDateForInput(filterDateRange.from))
                        : "Pick date range"}
                    </Button>
                  }
                />
                <PopoverContent
                  align="start"
                  className="w-auto p-0"
                  initialFocus={false}
                >
                  <Calendar mode="range" selected={filterDateRange} onSelect={setFilterDateRange} numberOfMonths={2} />
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

        <div className="flex items-center justify-between gap-2">
          <Input
            placeholder="Search table..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Settings2Icon className="size-4" />
                  Columns
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                Toggle columns
              </div>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                  >
                    {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-4 text-muted-foreground">
                  No rows found for this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </p>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    table.previousPage();
                  }}
                  aria-disabled={!table.getCanPreviousPage()}
                  className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  {table.getState().pagination.pageIndex + 1}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    table.nextPage();
                  }}
                  aria-disabled={!table.getCanNextPage()}
                  className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </CardContent>
    </Card>
  );
}

