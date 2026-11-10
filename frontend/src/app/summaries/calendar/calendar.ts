import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { SummaryPeriod } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { addDays, fromIsoDate, periodDate, toIsoDate } from '../dates';

/** One square of the grid: a day (Day and Week tabs) or a month (Month tab). */
interface Cell {
  label: string;
  /** The date the cell stands for: the day, the Monday of its week or the 1st of the month. */
  value: string;
  enabled: boolean;
  selected: boolean;
  /** A day of the previous or next month, shown to fill the first and last rows. */
  outside: boolean;
  today: boolean;
}

/**
 * Date picker of the summaries. Only the dates that have a summary can be picked: the others
 * are greyed out. For the Day tab it picks a day, for the Week tab a whole row (the week),
 * for the Month tab a month of a 12-month grid.
 */
@Component({
  selector: 'app-calendar',
  styleUrl: './calendar.scss',
  templateUrl: './calendar.html',
})
export class Calendar {
  protected readonly i18n = inject(I18nService);

  readonly period = input.required<SummaryPeriod>();
  /** The dates with a summary, 'YYYY-MM-DD', as the backend sends them. */
  readonly available = input.required<string[]>();
  readonly selected = input.required<string>();
  readonly picked = output<string>();

  /** The month shown (its 1st), or the year (its January 1st) for the Month tab. */
  protected readonly view = linkedSignal(() => {
    const selected = fromIsoDate(this.selected());
    return new Date(
      selected.getFullYear(),
      this.period() === 'monthly' ? 0 : selected.getMonth(),
      1,
    );
  });

  private readonly availableSet = computed(() => new Set(this.available()));
  private readonly today = toIsoDate(new Date());

  protected readonly title = computed(() =>
    new Intl.DateTimeFormat(this.i18n.language(), {
      year: 'numeric',
      month: this.period() === 'monthly' ? undefined : 'long',
    }).format(this.view()),
  );

  /** "M", "T", "W"… from Monday, in the interface language. */
  protected readonly weekdays = computed(() => {
    const format = new Intl.DateTimeFormat(this.i18n.language(), { weekday: 'narrow' });
    const monday = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => format.format(addDays(monday, i)));
  });

  /** Rows of 7 days, from the Monday before the 1st to the Sunday after the last day. */
  protected readonly weeks = computed<Cell[][]>(() => {
    const view = this.view();
    const period = this.period();
    const month = view.getMonth();
    let day = fromIsoDate(periodDate('weekly', view));
    const rows: Cell[][] = [];
    while (rows.length === 0 || day.getMonth() === month) {
      const row: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const value = periodDate(period, day);
        row.push({
          label: String(day.getDate()),
          value,
          enabled: this.availableSet().has(value),
          selected: value === this.selected(),
          outside: day.getMonth() !== month,
          today: toIsoDate(day) === this.today,
        });
        day = addDays(day, 1);
      }
      rows.push(row);
    }
    return rows;
  });

  protected readonly months = computed<Cell[]>(() => {
    const year = this.view().getFullYear();
    const format = new Intl.DateTimeFormat(this.i18n.language(), { month: 'short' });
    return Array.from({ length: 12 }, (_, month) => {
      const date = new Date(year, month, 1);
      const value = toIsoDate(date);
      return {
        label: format.format(date),
        value,
        enabled: this.availableSet().has(value),
        selected: value === this.selected(),
        outside: false,
        today: value === periodDate('monthly', new Date()),
      };
    });
  });

  /** The arrows only move where there is something to pick. */
  protected readonly canGoBack = computed(() => {
    const first = this.available()[0];
    return first !== undefined && first < toIsoDate(this.view());
  });

  protected readonly canGoForward = computed(() => {
    const last = this.available().at(-1);
    return last !== undefined && last >= toIsoDate(this.shift(1));
  });

  protected move(step: number): void {
    this.view.set(this.shift(step));
  }

  /** The view one month (one year for the Month tab) before or after. */
  private shift(step: number): Date {
    const view = this.view();
    return this.period() === 'monthly'
      ? new Date(view.getFullYear() + step, 0, 1)
      : new Date(view.getFullYear(), view.getMonth() + step, 1);
  }
}
