"use client";

import { NotebookPenIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AccumulatorNotePopover({
  displayName,
  note,
  noteDraft,
  isOpen,
  isSaved,
  onOpenChange,
  onDraftChange,
  onSave,
  onClear,
}: {
  displayName: string;
  note: string;
  noteDraft: string;
  isOpen: boolean;
  isSaved: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" size="icon-sm" variant={note.trim() ? "default" : "outline"}>
            <NotebookPenIcon className="size-4" />
            <span className="sr-only">Edit accumulator note</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{displayName} note</Label>
          <textarea
            value={noteDraft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Add notes for this accumulator..."
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{isSaved ? "Saved" : " "}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onClear}
                disabled={noteDraft.trim().length === 0 && note.trim().length === 0}
              >
                Clear
              </Button>
              <Button type="button" size="sm" onClick={onSave}>
                Save note
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
