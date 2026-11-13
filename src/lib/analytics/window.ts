import { getGameDate } from "@/lib/game-date";

export type ReportingDays = 7 | 30 | 90;
export function parseReportingDays(value: unknown): ReportingDays | null {
  if (value === undefined) return 30;
  return value === "7" ? 7 : value === "30" ? 30 : value === "90" ? 90 : null;
}
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** Calendar days including today; SQL converts each boundary using NY timezone. */
export function reportingWindow(days: ReportingDays, now = new Date()) {
  const today = getGameDate(now);
  const startDate = shiftDate(today, 1 - days);
  const endDate = shiftDate(today, 1);
  return {
    days,
    startDate,
    endDate,
    dates: Array.from({ length: days }, (_, i) => shiftDate(startDate, i)),
  };
}
