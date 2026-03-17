import type { ActualWinnerSide, MatchInputRow, MatchResultRow, WinnerSide } from "@/types/domain/match";

export type MatchOutcomeRow = {
  id: string;
  date: string;
  odds: string;
  winnerSide: WinnerSide;
  actualWinnerSide: ActualWinnerSide;
};

export type MatchInputWithResultRow = MatchInputRow & {
  actualWinnerSide: ActualWinnerSide;
};

function normalizeWinnerSide(value: unknown): WinnerSide {
  return value === "away" ? "away" : "home";
}

function normalizeActualWinnerSide(value: unknown): ActualWinnerSide {
  return value === "home" || value === "away" || value === "draw" ? value : null;
}

export function mapMatchOutcomeRow(id: string, data: Record<string, unknown>): MatchOutcomeRow {
  return {
    id,
    date: String(data.date ?? ""),
    odds: String(data.odds ?? "0"),
    winnerSide: normalizeWinnerSide(data.winnerSide),
    actualWinnerSide: normalizeActualWinnerSide(data.actualWinnerSide),
  };
}

export function mapMatchInputWithResultRow(
  id: string,
  data: Record<string, unknown>
): MatchInputWithResultRow {
  return {
    id,
    date: String(data.date ?? ""),
    homeTeam: String(data.homeTeam ?? ""),
    awayTeam: String(data.awayTeam ?? ""),
    competition: String(data.competition ?? ""),
    country: String(data.country ?? ""),
    winnerPercent: String(data.winnerPercent ?? "0"),
    winnerSide: normalizeWinnerSide(data.winnerSide),
    actualWinnerSide: normalizeActualWinnerSide(data.actualWinnerSide),
    odds: String(data.odds ?? "0"),
  };
}

export function mapMatchResultRow(id: string, data: Record<string, unknown>): MatchResultRow {
  return {
    id,
    date: String(data.date ?? ""),
    homeTeam: String(data.homeTeam ?? ""),
    awayTeam: String(data.awayTeam ?? ""),
    winnerSide: normalizeWinnerSide(data.winnerSide),
    actualWinnerSide: normalizeActualWinnerSide(data.actualWinnerSide),
  };
}
