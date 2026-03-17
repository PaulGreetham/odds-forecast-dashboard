"use client";

import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { AccumulatorAnalyticsRow } from "@/types/analytics";
import { formatDateDisplay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { SortableHeaderButton } from "@/components/ui/sortable-header-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(value: number) {
  return `€${value.toFixed(2)}`;
}

export function AnalyticsAccumulatorTable({ rows }: { rows: AccumulatorAnalyticsRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "day", desc: true }]);

  function sortHeader(
    label: string,
    column: {
      toggleSorting: (desc?: boolean) => void;
      getIsSorted: () => false | "asc" | "desc";
    }
  ) {
    return <SortableHeaderButton label={label} column={column} />;
  }

  const columns: ColumnDef<AccumulatorAnalyticsRow>[] = [
    { accessorKey: "name", header: ({ column }) => sortHeader("Accumulator", column) },
    {
      accessorKey: "day",
      header: ({ column }) => sortHeader("Day", column),
      cell: ({ row }) => (row.original.day ? formatDateDisplay(row.original.day) : "-"),
      sortingFn: (a, b) => (a.original.day ?? "").localeCompare(b.original.day ?? ""),
    },
    { accessorKey: "games", header: ({ column }) => sortHeader("Games", column) },
    {
      accessorKey: "combinedOdds",
      header: ({ column }) => sortHeader("Combined Odds", column),
      cell: ({ row }) => row.original.combinedOdds.toFixed(2),
    },
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
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-medium">Accumulator Table</h3>
        <p className="text-xs text-muted-foreground">
          Accumulator-only performance for the current date filter.
        </p>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-4 text-muted-foreground">
                No accumulators found for this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

