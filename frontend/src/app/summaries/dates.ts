/*
 * Calendar dates as the backend sends them: 'YYYY-MM-DD' strings on the user's local calendar.
 * Working with strings (not Date objects) keeps comparisons simple and avoids time zone shifts.
 */

import { SummaryPeriod } from '../core/api.service';

/** 'YYYY-MM-DD' of a local Date. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a 'YYYY-MM-DD' date (new Date('YYYY-MM-DD') would read it as UTC). */
export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The date that stands for the period holding `date`: the day, the Monday or the 1st. */
export function periodDate(period: SummaryPeriod, date: Date): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === 'weekly') day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  if (period === 'monthly') day.setDate(1);
  return toIsoDate(day);
}

/** ISO week number (weeks start on Monday, week 1 holds January 4). */
export function weekNumber(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7)); // Thursday of that week
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** `days` days after a local date (negative: before). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
