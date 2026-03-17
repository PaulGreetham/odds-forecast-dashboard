export type WinnerSide = "home" | "away";

export type ActualWinnerSide = WinnerSide | "draw" | null;

export type MatchBase = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  winnerSide: WinnerSide;
  odds: string;
};

export type MatchInputRow = MatchBase & {
  competition: string;
  country: string;
  winnerPercent: string;
};

export type MatchResultRow = Pick<
  MatchBase,
  "id" | "date" | "homeTeam" | "awayTeam" | "winnerSide"
> & {
  actualWinnerSide: ActualWinnerSide;
};

export type MatchFormValues = Omit<MatchInputRow, "id">;

