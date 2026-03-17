"use client";

import type { Table } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export function TablePaginationFooter<TData>({
  table,
  className,
}: {
  table: Table<TData>;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
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
          {Array.from({ length: table.getPageCount() }, (_, index) => index)
            .slice(
              Math.max(0, table.getState().pagination.pageIndex - 1),
              Math.min(table.getPageCount(), table.getState().pagination.pageIndex + 2)
            )
            .map((pageIndex) => (
              <PaginationItem key={pageIndex}>
                <PaginationLink
                  href="#"
                  isActive={table.getState().pagination.pageIndex === pageIndex}
                  onClick={(event) => {
                    event.preventDefault();
                    table.setPageIndex(pageIndex);
                  }}
                >
                  {pageIndex + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
          {table.getPageCount() > 3 &&
          table.getState().pagination.pageIndex < table.getPageCount() - 2 ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}
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
  );
}
