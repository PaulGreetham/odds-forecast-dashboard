"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

function getChartColorVars(config: ChartConfig) {
  return Object.entries(config).reduce((vars, [key, value]) => {
    if (value.color) {
      vars[`--color-${key}` as keyof React.CSSProperties] = value.color;
    }
    return vars;
  }, {} as React.CSSProperties);
}

export function ChartContainer({
  id,
  className,
  config,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn("min-h-[220px] w-full text-xs", className)}
        style={getChartColorVars(config)}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export function ChartTooltipContent({
  active,
  payload,
  className,
  hideLabel = false,
  label,
  labelFormatter,
  formatter,
}: RechartsPrimitive.TooltipProps<number, string> & {
  hideLabel?: boolean;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!hideLabel ? (
        <div className="font-medium text-foreground">
          {labelFormatter ? labelFormatter(label, payload) : String(label)}
        </div>
      ) : null}
      <div className="grid gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const configItem = config[key];
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color ?? "currentColor" }}
                />
                <span className="text-muted-foreground">
                  {configItem?.label ?? item.name ?? key}
                </span>
              </div>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatter
                  ? formatter(item.value, item.name, item, payload, item.payload)
                  : Number(item.value ?? 0).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

