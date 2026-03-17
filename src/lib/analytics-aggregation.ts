import type { BetsState } from "@/types/domain/bets";
import type { ActualWinnerSide, WinnerSide } from "@/types/domain/match";
import { toDateKey } from "@/lib/date-utils";

type OutcomeMatchRow = {
  id: string;
  date: string;
  odds: string;
  winnerSide: WinnerSide;
  actualWinnerSide: ActualWinnerSide;
};

export type DailySpentReceivedRow = {
  date: string;
  spent: number;
  received: number;
};

export function aggregateDailySpentReceived(
  matches: OutcomeMatchRow[],
  betsState: BetsState
): DailySpentReceivedRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const byDate = new Map<string, DailySpentReceivedRow>();
  const matchesById = new Map(matches.map((row) => [row.id, row]));

  matches.forEach((row) => {
    if (!row.date || row.date > todayKey) {
      return;
    }

    const oddsValue = Number(row.odds);
    const isWinningPrediction = row.actualWinnerSide !== null && row.actualWinnerSide === row.winnerSide;
    const stakeValue = Number(
      betsState.rowStakes[row.id] && betsState.rowStakes[row.id] !== ""
        ? betsState.rowStakes[row.id]
        : betsState.defaultStake
    );

    const existing = byDate.get(row.date) ?? { date: row.date, spent: 0, received: 0 };

    if (Number.isFinite(stakeValue) && stakeValue > 0) {
      existing.spent += stakeValue;
      if (isWinningPrediction && Number.isFinite(oddsValue) && oddsValue > 0) {
        existing.received += stakeValue * oddsValue;
      }
    }

    byDate.set(row.date, existing);
  });

  betsState.accumulators.forEach((accumulator) => {
    if (!accumulator.matchIds.length) {
      return;
    }

    const stakeValue = Number(accumulator.stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      return;
    }

    const accumulatorMatches = accumulator.matchIds
      .map((id) => matchesById.get(id))
      .filter((match): match is OutcomeMatchRow => Boolean(match));
    if (!accumulatorMatches.length) {
      return;
    }

    const day = accumulator.day ?? accumulatorMatches[0].date;
    if (!day || day > todayKey) {
      return;
    }

    const existing = byDate.get(day) ?? { date: day, spent: 0, received: 0 };
    existing.spent += stakeValue;

    let allWon = true;
    let combinedOdds = 1;
    for (const match of accumulatorMatches) {
      const oddsValue = Number(match.odds);
      const won = match.actualWinnerSide !== null && match.actualWinnerSide === match.winnerSide;
      if (!won || !Number.isFinite(oddsValue) || oddsValue <= 0) {
        allWon = false;
        break;
      }
      combinedOdds *= oddsValue;
    }

    if (allWon) {
      existing.received += stakeValue * combinedOdds;
    }

    byDate.set(day, existing);
  });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
