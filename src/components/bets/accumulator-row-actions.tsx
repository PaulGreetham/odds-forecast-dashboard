"use client";

import { Button } from "@/components/ui/button";

export function AccumulatorRowActions({
  hasMatches,
  onClear,
  onRemove,
}: {
  hasMatches: boolean;
  onClear: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onClear} disabled={!hasMatches}>
        Clear
      </Button>
      <Button type="button" size="sm" variant="destructive" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
