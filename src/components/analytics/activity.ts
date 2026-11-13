export type ActivityDay = { date: string; results: number };
export type ActivityBar = {
  startDate: string;
  endDate: string;
  weekStart: string;
  results: number;
};

/** Input dates are already New York calendar dates. UTC arithmetic operates on
 * date labels only, avoiding DST-dependent 24-hour assumptions about instants.
 * Calendar weeks run Monday through Sunday, clipped to the reporting window.
 */
export function activityBars(
  days: readonly ActivityDay[],
  weekly: boolean,
): ActivityBar[] {
  if (!weekly)
    return days.map(({ date, results }) => ({
      startDate: date,
      endDate: date,
      weekStart: date,
      results,
    }));
  const weeks = new Map<string, ActivityBar>();
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const weekStart = date.toISOString().slice(0, 10);
    const bar = weeks.get(weekStart);
    if (bar) {
      bar.startDate = day.date < bar.startDate ? day.date : bar.startDate;
      bar.endDate = day.date > bar.endDate ? day.date : bar.endDate;
      bar.results += day.results;
    } else
      weeks.set(weekStart, {
        startDate: day.date,
        endDate: day.date,
        weekStart,
        results: day.results,
      });
  }
  return [...weeks.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
}
