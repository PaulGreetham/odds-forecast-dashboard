"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
} from "lucide-react";
import type { DateRange } from "react-day-picker";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHeaderButton } from "@/components/ui/sortable-header-button";
import { DateFilterToolbar } from "@/components/ui/date-filter-toolbar";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MatchResultRow } from "@/types/domain/match";
import type { DateFilterMode } from "@/types/filters";
import { formatDateDisplay, formatDateForInput, matchesDateFilter } from "@/lib/date-utils";

export function MatchResultsTable() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [rows, setRows] = useState<MatchResultRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<DateFilterMode>("date");

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
              data.actualWinnerSide === "home" ||
              data.actualWinnerSide === "away" ||
              data.actualWinnerSide === "draw"
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

  async function setActualWinner(matchId: string, side: "home" | "away" | "draw") {
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
    if (row.actualWinnerSide === "draw") {
      return "Draw";
    }
    return "Not set";
  }

  function getPredictionResult(row: MatchResultRow) {
    if (!row.actualWinnerSide) {
      return "Not set";
    }
    return row.actualWinnerSide === row.winnerSide ? "Successful" : "Unsuccessful";
  }

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesDateFilter(row.date, filterMode, filterDate, filterDateRange)),
    [filterDate, filterDateRange, filterMode, rows]
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

  const columns: ColumnDef<MatchResultRow>[] = [
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
      id: "predictedWinner",
      accessorFn: (row) => getPredictedWinner(row),
      header: ({ column }) => sortableHeader("Predicted Winner", column),
      cell: ({ row }) => (
        <span className="block truncate text-emerald-600 dark:text-emerald-400">
          {getPredictedWinner(row.original)}
        </span>
      ),
    },
    {
      id: "actualWinner",
      accessorFn: (row) => getActualWinner(row),
      header: ({ column }) => sortableHeader("Actual Winner", column),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={row.original.actualWinnerSide === "home" ? "default" : "outline"}
            className={cn(
              "h-7 min-w-[4.5rem] px-2 text-xs leading-none font-medium justify-center",
              row.original.actualWinnerSide === "home" &&
                "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            onClick={() => setActualWinner(row.original.id, "home")}
            disabled={updatingId === row.original.id}
          >
            Home
          </Button>
          <Button
            type="button"
            size="sm"
            variant={row.original.actualWinnerSide === "draw" ? "default" : "outline"}
            className={cn(
              "h-7 min-w-[4.5rem] px-2 text-xs leading-none font-medium justify-center",
              row.original.actualWinnerSide === "draw" &&
                "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            onClick={() => setActualWinner(row.original.id, "draw")}
            disabled={updatingId === row.original.id}
          >
            Draw
          </Button>
          <Button
            type="button"
            size="sm"
            variant={row.original.actualWinnerSide === "away" ? "default" : "outline"}
            className={cn(
              "h-7 min-w-[4.5rem] px-2 text-xs leading-none font-medium justify-center",
              row.original.actualWinnerSide === "away" &&
                "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            onClick={() => setActualWinner(row.original.id, "away")}
            disabled={updatingId === row.original.id}
          >
            Away
          </Button>
        </div>
      ),
    },
    {
      id: "predictionResult",
      accessorFn: (row) => getPredictionResult(row),
      header: ({ column }) => sortableHeader("Prediction Result", column),
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
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: { pageSize: 15 },
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

        <TablePaginationFooter table={table} />
      </CardContent>
    </Card>
  );
}
