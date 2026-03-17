"use client";

import { useCallback, useMemo, useState } from "react";
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
import type { DateRange } from "react-day-picker";
import {
  CalendarIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";

import { isFirebaseConfigured } from "@/lib/firebase";
import { formatDateDisplay, formatDateForInput, matchesDateFilter } from "@/lib/date-utils";
import { useAuthUid } from "@/hooks/firebase/use-auth-uid";
import { useBetsState } from "@/hooks/firebase/use-bets-state";
import { useMatches } from "@/hooks/firebase/use-matches";
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
import { SortableHeaderButton } from "@/components/ui/sortable-header-button";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalyticsAccumulatorTable } from "@/components/analytics-accumulator-table";
import type { MatchInputRow } from "@/types/domain/match";
import type { AccumulatorAnalyticsRow, AnalyticsTableRow } from "@/types/analytics";
import type { DateFilterMode } from "@/types/filters";

type MatchRow = MatchInputRow & {
  actualWinnerSide: "home" | "away" | "draw" | null;
};

function formatCurrency(value: number) {
  return `€${value.toFixed(2)}`;
}

export function AnalyticsTablesView() {
  const uid = useAuthUid();
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [filterMode, setFilterMode] = useState<DateFilterMode>("date");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const mapMatch = useCallback(
    (id: string, data: Record<string, unknown>): MatchRow => ({
      id,
      date: String(data.date ?? ""),
      homeTeam: String(data.homeTeam ?? ""),
      awayTeam: String(data.awayTeam ?? ""),
      competition: String(data.competition ?? ""),
      country: String(data.country ?? ""),
      winnerPercent: String(data.winnerPercent ?? "0"),
      winnerSide: data.winnerSide === "away" ? "away" : "home",
      actualWinnerSide:
        data.actualWinnerSide === "home" ||
        data.actualWinnerSide === "away" ||
        data.actualWinnerSide === "draw"
          ? data.actualWinnerSide
          : null,
      odds: String(data.odds ?? "0"),
    }),
    []
  );
  const { rows: matches, error: matchesError } = useMatches(uid, mapMatch, "date", "desc");
  const { betsState, error: betsStateError } = useBetsState(uid);
  const listenerError = matchesError ?? betsStateError ?? null;

  const tableRows = useMemo<AnalyticsTableRow[]>(() => {
    const counts = new Map<string, number>();
    const accumulatorContrib = new Map<string, { stake: number; return: number; profit: number }>();
    const matchesById = new Map(matches.map((row) => [row.id, row]));

    betsState.accumulators.forEach((acc) => {
      acc.matchIds.forEach((matchId) => {
        counts.set(matchId, (counts.get(matchId) ?? 0) + 1);
      });
    });

    betsState.accumulators.forEach((acc) => {
      const stakeValue = Number(acc.stake);
      if (!Number.isFinite(stakeValue) || stakeValue <= 0 || !acc.matchIds.length) {
        return;
      }

      const selected = acc.matchIds
        .map((id) => matchesById.get(id))
        .filter((item): item is MatchRow => Boolean(item));
      if (!selected.length) {
        return;
      }

      let allWon = true;
      let combinedOdds = 1;
      selected.forEach((match) => {
        const oddsValue = Number(match.odds);
        const won = match.actualWinnerSide !== null && match.actualWinnerSide === match.winnerSide;
        if (!won || !Number.isFinite(oddsValue) || oddsValue <= 0) {
          allWon = false;
          return;
        }
        combinedOdds *= oddsValue;
      });

      const totalReturn = allWon ? stakeValue * combinedOdds : 0;
      const shareStake = stakeValue / selected.length;
      const shareReturn = totalReturn / selected.length;
      const shareProfit = shareReturn - shareStake;

      selected.forEach((match) => {
        const prev = accumulatorContrib.get(match.id) ?? { stake: 0, return: 0, profit: 0 };
        accumulatorContrib.set(match.id, {
          stake: prev.stake + shareStake,
          return: prev.return + shareReturn,
          profit: prev.profit + shareProfit,
        });
      });
    });

    return matches.map((row) => {
      const predictedWinner = row.winnerSide === "away" ? row.awayTeam : row.homeTeam;
      const actualWinner =
        row.actualWinnerSide === null
          ? "Pending"
          : row.actualWinnerSide === "draw"
            ? "Draw"
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
      const acc = accumulatorContrib.get(row.id) ?? { stake: 0, return: 0, profit: 0 };

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
        stake: singleStake + acc.stake,
        return: singleReturn + acc.return,
        profit: singleProfit + acc.profit,
        accumulatorCount: counts.get(row.id) ?? 0,
      };
    });
  }, [betsState, matches]);

  const dateFilteredRows = useMemo(
    () =>
      tableRows.filter((row) =>
        matchesDateFilter(row.date, filterMode, filterDate, filterDateRange)
      ),
    [filterDate, filterDateRange, filterMode, tableRows]
  );

  const accumulatorRows = useMemo<AccumulatorAnalyticsRow[]>(() => {
    const matchesById = new Map(matches.map((row) => [row.id, row]));

    return betsState.accumulators.map((accumulator, index) => {
      const selected = accumulator.matchIds
        .map((matchId) => matchesById.get(matchId))
        .filter((item): item is MatchRow => Boolean(item));

      let allWon = true;
      let combinedOdds = 1;
      selected.forEach((match) => {
        const oddsValue = Number(match.odds);
        const won = match.actualWinnerSide !== null && match.actualWinnerSide === match.winnerSide;
        if (!won || !Number.isFinite(oddsValue) || oddsValue <= 0) {
          allWon = false;
          return;
        }
        combinedOdds *= oddsValue;
      });

      const stake = Number(accumulator.stake) || 0;
      const potentialReturn = selected.length && allWon ? stake * combinedOdds : 0;

      return {
        id: accumulator.id,
        name: accumulator.name || `Accumulator ${index + 1}`,
        day: accumulator.day,
        games: selected.length,
        combinedOdds: selected.length ? combinedOdds : 0,
        stake,
        return: potentialReturn,
        profit: potentialReturn - stake,
      };
    });
  }, [betsState.accumulators, matches]);

  const dateFilteredAccumulatorRows = useMemo(
    () =>
      accumulatorRows.filter(
        (row) =>
          Boolean(row.day) &&
          matchesDateFilter(String(row.day), filterMode, filterDate, filterDateRange)
      ),
    [accumulatorRows, filterDate, filterDateRange, filterMode]
  );

  function sortHeader(
    label: string,
    column: {
      toggleSorting: (desc?: boolean) => void;
      getIsSorted: () => false | "asc" | "desc";
    }
  ) {
    return <SortableHeaderButton label={label} column={column} />;
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
      accessorKey: "stake",
      header: ({ column }) => sortHeader("Stake", column),
      cell: ({ row }) => formatCurrency(row.original.stake),
    },
    {
      accessorKey: "return",
      header: ({ column }) => sortHeader("Return", column),
      cell: ({ row }) => formatCurrency(row.original.return),
    },
    {
      accessorKey: "profit",
      header: ({ column }) => sortHeader("Profit", column),
      cell: ({ row }) => (
        <span
          className={cn(
            row.original.profit >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {formatCurrency(row.original.profit)}
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

        <TablePaginationFooter table={table} />

        <AnalyticsAccumulatorTable rows={dateFilteredAccumulatorRows} />
      </CardContent>
    </Card>
  );
}

