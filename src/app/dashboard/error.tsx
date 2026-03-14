"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-3 p-6">
      <p className="text-sm text-destructive">Something went wrong loading this dashboard page.</p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

