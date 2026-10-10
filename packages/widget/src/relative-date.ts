import { locale, t } from "./i18n";

const units = [
  ["year", 365 * 86_400],
  ["month", 30 * 86_400],
  ["week", 7 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

/** How long ago a date was, as "il y a 3 jours", or "à l'instant" within a minute. */
export function relativeDate(date: Date, now = new Date()): string {
  const seconds = (now.getTime() - date.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size)
      return format.format(-Math.floor(seconds / size), unit);
  }
  return t("justNow");
}
