"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type SortState = false | "asc" | "desc";

type SortableColumn = {
  toggleSorting: (desc?: boolean) => void;
  getIsSorted: () => SortState;
};

export function SortableHeaderButton({
  label,
  column,
  className = "-ml-3 h-8",
}: {
  label: string;
  column: SortableColumn;
  className?: string;
}) {
  const sortState = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => column.toggleSorting(sortState === "asc")}
    >
      {label}
      {sortState === "asc" ? (
        <ArrowUpIcon className="size-4" />
      ) : sortState === "desc" ? (
        <ArrowDownIcon className="size-4" />
      ) : (
        <ArrowUpDownIcon className="size-4 opacity-60" />
      )}
    </Button>
  );
}
