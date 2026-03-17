"use client";

import { formatDateDisplay } from "@/lib/date-utils";
import type { AccumulatorSummaryRow } from "@/components/bets/bets-utils";
import { AccumulatorNotePopover } from "@/components/bets/accumulator-note-popover";
import { AccumulatorRowActions } from "@/components/bets/accumulator-row-actions";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";

export function AccumulatorSummaryRowItem({
  summary,
  displayName,
  noteDraft,
  isNoteOpen,
  isNoteSaved,
  onStakeChange,
  onNoteOpenChange,
  onNoteDraftChange,
  onNoteSave,
  onNoteClear,
  onClearMatches,
  onRemove,
}: {
  summary: AccumulatorSummaryRow;
  displayName: string;
  noteDraft: string;
  isNoteOpen: boolean;
  isNoteSaved: boolean;
  onStakeChange: (value: string) => void;
  onNoteOpenChange: (open: boolean) => void;
  onNoteDraftChange: (value: string) => void;
  onNoteSave: () => void;
  onNoteClear: () => void;
  onClearMatches: () => void;
  onRemove: () => void;
}) {
  return (
    <TableRow>
      <TableCell>{displayName}</TableCell>
      <TableCell>{summary.day ? formatDateDisplay(summary.day) : "-"}</TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={summary.stake}
          onChange={(event) => onStakeChange(event.target.value)}
          className="h-8"
        />
      </TableCell>
      <TableCell>{summary.matches.length}</TableCell>
      <TableCell>{summary.matches.length ? summary.combinedOdds.toFixed(2) : "0.00"}</TableCell>
      <TableCell>{summary.matches.length ? summary.potentialReturn.toFixed(2) : "0.00"}</TableCell>
      <TableCell>{summary.matches.length ? summary.profit.toFixed(2) : "0.00"}</TableCell>
      <TableCell>
        <AccumulatorNotePopover
          displayName={displayName}
          note={summary.note ?? ""}
          noteDraft={noteDraft}
          isOpen={isNoteOpen}
          isSaved={isNoteSaved}
          onOpenChange={onNoteOpenChange}
          onDraftChange={onNoteDraftChange}
          onSave={onNoteSave}
          onClear={onNoteClear}
        />
      </TableCell>
      <TableCell>
        <AccumulatorRowActions
          hasMatches={summary.matches.length > 0}
          onClear={onClearMatches}
          onRemove={onRemove}
        />
      </TableCell>
    </TableRow>
  );
}
