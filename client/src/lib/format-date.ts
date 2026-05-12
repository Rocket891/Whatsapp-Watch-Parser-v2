/**
 * Centralized date/time formatting for the dashboard.
 *
 * Default style: "12 May 2026, 2:35:52 PM"
 * - Day-Month-Year (day first, like Indian convention)
 * - Abbreviated month name (3 letters)
 * - 12-hour time with AM/PM
 *
 * Use formatDateTime() for table cells, log timestamps, etc.
 * Use formatDate() for date-only displays (no time).
 *
 * Implementation uses Intl.DateTimeFormat with the en-GB locale so
 * the day comes before the month. The hour12 flag makes it AM/PM.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Format a date+time as "12 May 2026, 2:35:52 pm". Returns "—" for falsy/invalid input. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  // en-GB gives "12 May 2026 at 14:35:52" in some Intl impls; normalize to "12 May 2026, 2:35:52 PM"
  const parts = DATE_TIME_FORMATTER.formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const second = parts.find((p) => p.type === "second")?.value ?? "";
  const dayPeriod =
    parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase().replace(/\./g, "") ?? "";
  return `${day} ${month} ${year}, ${hour}:${minute}:${second} ${dayPeriod}`.trim();
}

/** Format a date as "12 May 2026" (no time). Returns "—" for falsy/invalid input. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_ONLY_FORMATTER.format(d);
}
