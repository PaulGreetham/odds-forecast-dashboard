export function parseDateKey(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseStoredDate(value: string) {
  if (!value) {
    return null;
  }

  const parsedKeyDate = parseDateKey(value);
  if (parsedKeyDate) {
    return parsedKeyDate;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(value: string) {
  if (!value) {
    return "-";
  }
  const parsed = parseDateKey(value) ?? new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

type DateRangeLike = {
  from?: Date;
  to?: Date;
} | undefined;

export function matchesDateFilter(
  value: string,
  mode: "date" | "range",
  filterDate?: Date,
  filterDateRange?: DateRangeLike
) {
  if (mode === "date" && !filterDate) {
    return true;
  }

  if (mode === "range" && !filterDateRange?.from && !filterDateRange?.to) {
    return true;
  }

  if (mode === "date" && filterDate) {
    return value === formatDateForInput(filterDate);
  }

  const rowDate = parseStoredDate(value);
  if (!rowDate) {
    return false;
  }

  const from = filterDateRange?.from ? startOfDay(filterDateRange.from) : null;
  const to = filterDateRange?.to ? endOfDay(filterDateRange.to) : from;
  if (from && rowDate < from) {
    return false;
  }
  if (to && rowDate > to) {
    return false;
  }
  return true;
}

