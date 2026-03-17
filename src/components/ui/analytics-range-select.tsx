"use client";

import { ChevronDownIcon } from "lucide-react";

import { ANALYTICS_RANGE_OPTIONS, getAnalyticsRangeLabel, type AnalyticsRangeMode } from "@/lib/analytics-range";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AnalyticsRangeSelect({
  value,
  onChange,
  triggerClassName = "w-[180px] justify-between rounded-lg",
  contentClassName = "w-[180px] rounded-xl",
  align = "end",
}: {
  value: AnalyticsRangeMode;
  onChange: (value: AnalyticsRangeMode) => void;
  triggerClassName?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" className={triggerClassName}>
            {getAnalyticsRangeLabel(value)}
            <ChevronDownIcon className="size-4 opacity-70" />
          </Button>
        }
      />
      <DropdownMenuContent align={align} className={contentClassName}>
        {ANALYTICS_RANGE_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
