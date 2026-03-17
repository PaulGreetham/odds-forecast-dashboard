"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  type ColumnFiltersState,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getFilteredRowModel,
  getPaginationRowModel,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  PencilIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { MatchInputRow } from "@/types/domain/match";
import type { DateFilterMode } from "@/types/filters";
import { endOfDay, formatDateDisplay, formatDateForInput, startOfDay } from "@/lib/date-utils";

type MatchRow = MatchInputRow;

type MatchFormValues = Omit<MatchRow, "id">;

const initialForm: MatchFormValues = {
  date: "",
  homeTeam: "",
  awayTeam: "",
  competition: "",
  country: "",
  winnerPercent: "",
  winnerSide: "home",
  odds: "",
};

export function MatchOddsFormTable() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [form, setForm] = useState<MatchFormValues>(initialForm);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
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
        const nextRows: MatchRow[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            date: String(data.date ?? ""),
            homeTeam: String(data.homeTeam ?? ""),
            awayTeam: String(data.awayTeam ?? ""),
            competition: String(data.competition ?? ""),
            country: String(data.country ?? ""),
            winnerPercent: String(data.winnerPercent ?? ""),
            winnerSide: data.winnerSide === "away" ? "away" : "home",
            odds: String(data.odds ?? ""),
          };
        });
        setRows(nextRows);
      },
      () => {
        setError("Matches could not be loaded due to Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, [matchesCollection]);

  function handleChange(field: keyof MatchFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.date) {
      setError("Please select a date.");
      return;
    }

    if (!matchesCollection) {
      setError("No authenticated user found.");
      return;
    }

    try {
      setIsSaving(true);

      if (editingId) {
        await updateDoc(doc(matchesCollection, editingId), {
          ...form,
          updatedAt: serverTimestamp(),
        });
        setEditingId(null);
      } else {
        await addDoc(matchesCollection, {
          ...form,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setForm(initialForm);
    } catch {
      setError("Failed to save row. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(row: MatchRow) {
    setEditingId(row.id);
    setForm({
      date: row.date,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      competition: row.competition,
      country: row.country,
      winnerPercent: row.winnerPercent,
      winnerSide: row.winnerSide,
      odds: row.odds,
    });
  }

  async function handleDelete(id: string) {
    setError(null);

    if (!matchesCollection) {
      setError("No authenticated user found.");
      return;
    }

    try {
      await deleteDoc(doc(matchesCollection, id));
      if (editingId === id) {
        setEditingId(null);
        setForm(initialForm);
      }
    } catch {
      setError("Failed to delete row. Please try again.");
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  function getPredictedWinner(row: MatchRow) {
    return row.winnerSide === "away"
      ? row.awayTeam || "Away Team"
      : row.homeTeam || "Home Team";
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

  const dateFilteredRows = useMemo(() => {
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

  const columns: ColumnDef<MatchRow>[] = [
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
      accessorKey: "homeTeam",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Home Team
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => (
        <span
          className={cn(
            row.original.winnerSide === "home"
              ? "font-semibold text-emerald-600 dark:text-emerald-400"
              : undefined
          )}
        >
          {row.original.homeTeam}
        </span>
      ),
    },
    {
      accessorKey: "awayTeam",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Away Team
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
      cell: ({ row }) => (
        <span
          className={cn(
            row.original.winnerSide === "away"
              ? "font-semibold text-emerald-600 dark:text-emerald-400"
              : undefined
          )}
        >
          {row.original.awayTeam}
        </span>
      ),
    },
    {
      accessorKey: "competition",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Competition
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
    },
    {
      accessorKey: "country",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Country
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
    },
    {
      accessorKey: "winnerPercent",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Win %
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
    },
    {
      accessorKey: "odds",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Odds
          {renderSortIcon(column.getIsSorted())}
        </Button>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => {
        const match = row.original;
        return (
          <Popover
            open={openActionId === match.id}
            onOpenChange={(isOpen) => setOpenActionId(isOpen ? match.id : null)}
          >
            <PopoverTrigger
              render={
                <Button type="button" size="icon-sm" variant="outline">
                  <PencilIcon className="size-4" />
                  <span className="sr-only">Open row actions</span>
                </Button>
              }
            />
            <PopoverContent align="end" className="w-32 p-2">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    handleEdit(match);
                    setOpenActionId(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    await handleDelete(match.id);
                    setOpenActionId(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      },
    },
  ];

  const table = useReactTable({
    data: dateFilteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue).toLowerCase();
      const values = [
        row.original.date,
        row.original.homeTeam,
        row.original.awayTeam,
        row.original.competition,
        row.original.country,
        row.original.winnerPercent,
        row.original.odds,
        getPredictedWinner(row.original),
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    },
    state: {
      globalFilter,
      sorting,
      columnVisibility,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  function getColumnWidthClass(columnId: string) {
    switch (columnId) {
      case "homeTeam":
      case "awayTeam":
        return "w-[12rem]";
      case "date":
        return "w-[9rem]";
      case "competition":
      case "country":
        return "w-[10rem]";
      case "winnerPercent":
        return "w-[7rem]";
      case "odds":
        return "w-[6rem]";
      case "actions":
        return "w-[5rem]";
      default:
        return "";
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Match Input</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      id="date"
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start font-normal",
                        !form.date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="size-4" />
                      {form.date ? formatDateDisplay(form.date) : "Pick a date"}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={form.date ? new Date(form.date) : undefined}
                    onSelect={(date) => {
                      if (!date) {
                        return;
                      }
                      handleChange("date", formatDateForInput(date));
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="homeTeam">Home Team</Label>
              <Input
                id="homeTeam"
                value={form.homeTeam}
                onChange={(e) => handleChange("homeTeam", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="awayTeam">Away Team</Label>
              <Input
                id="awayTeam"
                value={form.awayTeam}
                onChange={(e) => handleChange("awayTeam", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="competition">Competition</Label>
              <Input
                id="competition"
                value={form.competition}
                onChange={(e) => handleChange("competition", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => handleChange("country", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="winnerPercent">Win %</Label>
              <Input
                id="winnerPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.winnerPercent}
                onChange={(e) => handleChange("winnerPercent", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="winnerSide">Winner</Label>
              <div id="winnerSide" className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange("winnerSide", "home")}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    form.winnerSide === "home"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-input"
                  )}
                >
                  <span
                    className={cn(
                      "size-4 rounded-sm border",
                      form.winnerSide === "home"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">{form.homeTeam || "Home Team"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange("winnerSide", "away")}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    form.winnerSide === "away"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-input"
                  )}
                >
                  <span
                    className={cn(
                      "size-4 rounded-sm border",
                      form.winnerSide === "away"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">{form.awayTeam || "Away Team"}</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="odds">Odds</Label>
              <Input
                id="odds"
                type="number"
                min="0"
                step="0.01"
                value={form.odds}
                onChange={(e) => handleChange("odds", e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isSaving || !uid || !isFirebaseConfigured}>
                  {editingId ? "Update Row" : "Add Row"}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" onClick={handleCancelEdit}>
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          {!isFirebaseConfigured ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Firebase is not configured.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Match Data Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-2">
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
          <div className="mb-4 flex items-center justify-between gap-2">
            <Input
              placeholder="Filter rows..."
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
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
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
                      <TableCell
                        key={cell.id}
                        className={cn(getColumnWidthClass(cell.column.id), "truncate")}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-4 text-muted-foreground">
                    No rows yet. Submit the form to add your first row.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePaginationFooter table={table} className="mt-4" />
        </CardContent>
      </Card>

    </div>
  );
}
