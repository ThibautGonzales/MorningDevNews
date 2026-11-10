import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, PeriodSummaries, Summary, SummaryPeriod } from '../core/api.service';
import { CollectionService } from '../core/collection.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations';
import { Calendar } from './calendar/calendar';
import { addDays, fromIsoDate, weekNumber } from './dates';

const PERIODS: SummaryPeriod[] = ['daily', 'weekly', 'monthly'];

/**
 * Home page: the summaries of each topic for a day, a week or a month. The arrows and the
 * calendar move to the previous or next date that has a summary. The period and the date live
 * in the URL (?period=weekly&date=2026-11-02): a reload keeps the page where it was, and no date
 * means the latest summaries.
 */
@Component({
  selector: 'app-summaries',
  imports: [DatePipe, Calendar],
  styleUrl: './summaries.scss',
  templateUrl: './summaries.html',
  host: {
    '(document:click)': 'closeCalendarOutside($event)',
    '(document:keydown.escape)': 'calendarOpen.set(false)',
  },
})
export class Summaries {
  private readonly api = inject(ApiService);
  private readonly collection = inject(CollectionService);
  private readonly router = inject(Router);
  private readonly element = inject(ElementRef<HTMLElement>);
  protected readonly i18n = inject(I18nService);

  /**
   * One tab per period, with its label, the text shown when a topic has no summary at all yet,
   * and the one shown when it has none on the date picked.
   */
  protected readonly tabs: {
    period: SummaryPeriod;
    label: TranslationKey;
    never: TranslationKey;
    none: TranslationKey;
  }[] = [
    {
      period: 'daily',
      label: 'summaries.daily',
      never: 'summaries.never',
      none: 'summaries.noneOnDay',
    },
    {
      period: 'weekly',
      label: 'summaries.weekly',
      never: 'summaries.neverWeekly',
      none: 'summaries.noneOnWeek',
    },
    {
      period: 'monthly',
      label: 'summaries.monthly',
      never: 'summaries.neverMonthly',
      none: 'summaries.noneOnMonth',
    },
  ];

  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly period = computed<SummaryPeriod>(() => {
    const period = this.query()?.get('period');
    return PERIODS.find((p) => p === period) ?? 'daily';
  });
  /** The date asked in the URL, or null for the latest summaries. */
  private readonly requestedDate = computed(() => this.query()?.get('date') ?? null);

  protected readonly today = new Date();
  /** What the backend answered for the current period and date. */
  protected readonly data = signal<PeriodSummaries | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly calendarOpen = signal(false);
  /** The agent tip last copied, to say "Copied" on its button. */
  protected readonly copied = signal<string | null>(null);

  protected readonly topics = computed(() => this.data()?.topics ?? []);

  /** Counts under the title: the tips to try and the distinct articles they come from. */
  protected readonly stats = computed(() => {
    const points = this.topics().flatMap((topic) =>
      topic.summaries.flatMap((summary) => summary.points),
    );
    const articles = new Set(points.flatMap((point) => point.articles.map((a) => a.id)));
    return { tips: points.length, sources: articles.size };
  });

  /** The closest dates with a summary before and after the one shown, if any. */
  protected readonly previousDate = computed(() => {
    const data = this.data();
    return data?.available_dates.filter((date) => date < data.date).at(-1) ?? null;
  });

  protected readonly nextDate = computed(() => {
    const data = this.data();
    return data?.available_dates.find((date) => date > data.date) ?? null;
  });

  protected readonly isLatest = computed(() => {
    const data = this.data();
    return !data || data.date >= (data.available_dates.at(-1) ?? data.date);
  });

  /** Counts every request: an answer that is not the last one asked is dropped. */
  private requests = 0;

  constructor() {
    // Loads when the period or the date changes, and again after each collection.
    effect(() => {
      const period = this.period();
      const date = this.requestedDate();
      this.collection.completed();
      untracked(() => this.load(period, date));
    });
  }

  private load(period: SummaryPeriod, date: string | null): void {
    const request = ++this.requests;
    this.api.getSummaries(period, date).subscribe({
      next: (data) => {
        if (request !== this.requests) return;
        this.data.set(data);
        this.loadFailed.set(false);
      },
      error: () => {
        if (request === this.requests) this.loadFailed.set(true);
      },
    });
  }

  protected select(period: SummaryPeriod): void {
    if (period === this.period()) return;
    this.data.set(null); // never show last tab's summaries under the new tab
    this.navigate(period, null);
  }

  /** Shows the summaries of `date`, or the latest ones for null. */
  protected goTo(date: string | null): void {
    this.calendarOpen.set(false);
    this.navigate(this.period(), date);
  }

  private navigate(period: SummaryPeriod, date: string | null): void {
    this.router.navigate([], {
      queryParams: { period: period === 'daily' ? null : period, date },
    });
  }

  protected toggleCalendar(): void {
    this.calendarOpen.update((open) => !open);
  }

  protected closeCalendarOutside(event: MouseEvent): void {
    const picker = this.element.nativeElement.querySelector('.date-picker');
    if (picker && !picker.contains(event.target as Node)) this.calendarOpen.set(false);
  }

  protected copy(tip: string): void {
    navigator.clipboard?.writeText(tip).then(() => this.copied.set(tip));
  }

  /** The text of a topic with nothing to show: never summarized, or not on that date. */
  protected emptyKey(): TranslationKey {
    const tab = this.tabs.find((tab) => tab.period === this.period())!;
    return this.data()?.available_dates.length ? tab.none : tab.never;
  }

  /** "01", "02"…: the numbering style of the design. */
  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected asDate(iso: string): Date {
    return fromIsoDate(iso);
  }

  /** Sunday of the week starting on `iso`. */
  protected weekEnd(iso: string): Date {
    return addDays(fromIsoDate(iso), 6);
  }

  protected weekNumberOf(iso: string): number {
    return weekNumber(fromIsoDate(iso));
  }

  /** The last day a week or month covers: period_end is excluded (midnight of the next one). */
  protected lastDay(summary: Summary): Date {
    return new Date(Date.parse(summary.period_end) - 1);
  }

  protected summaryWeekNumber(summary: Summary): number {
    return weekNumber(new Date(summary.period_start));
  }
}
