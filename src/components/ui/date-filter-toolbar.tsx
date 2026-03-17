"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { formatDateDisplay, formatDateForInput } from "@/lib/date-utils";
import type { DateFilterMode } from "@/types/filters";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DateFilterToolbar({
  filterMode,
  onFilterModeChange,
  filterDate,
  onFilterDateChange,
  filterDateRange,
  onFilterDateRangeChange,
  onClear,
  className,
  rangePopoverModal,
}: {
  filterMode: DateFilterMode;
  onFilterModeChange: (mode: DateFilterMode) => void;
  filterDate?: Date;
  onFilterDateChange: (date: Date | undefined) => void;
  filterDateRange?: DateRange;
  onFilterDateRangeChange: (range: DateRange | undefined) => void;
  onClear: () => void;
  className?: string;
  rangePopoverModal?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Filter Mode</Label>
        <div className="inline-flex rounded-md border p-1">
          <Button
            type="button"
            size="sm"
            variant={filterMode === "date" ? "default" : "ghost"}
            onClick={() => onFilterModeChange("date")}
          >
            Date
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterMode === "range" ? "default" : "ghost"}
            onClick={() => onFilterModeChange("range")}
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
                  {filterDate ? formatDateDisplay(formatDateForInput(filterDate)) : "Pick date"}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-auto p-0" initialFocus={false}>
              <Calendar
                mode="single"
                selected={filterDate}
                onSelect={(date) => onFilterDateChange(date ?? undefined)}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date Range</Label>
          <Popover modal={rangePopoverModal}>
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
            <PopoverContent align="start" className="w-auto p-0" initialFocus={false}>
              <Calendar
                mode="range"
                selected={filterDateRange}
                onSelect={(range) => onFilterDateRangeChange(range)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <Button type="button" variant="outline" size="icon-sm" onClick={onClear}>
        <XIcon className="size-4" />
        <span className="sr-only">Clear date filters</span>
      </Button>
    </div>
  );
}
