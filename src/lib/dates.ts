/** Today's date in India as YYYY-MM-DD (servers run in UTC, so we shift by +5:30). */
export function todayIST(now: number = Date.now()) {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
}
