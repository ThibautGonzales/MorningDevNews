import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService, Summary, SummaryPeriod, TopicSummary } from '../core/api.service';
import { CollectionService } from '../core/collection.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations';

/** Home page: the latest summary of each topic, for the day, the week or the month. */
@Component({
  selector: 'app-summaries',
  imports: [DatePipe],
  styleUrl: './summaries.scss',
  templateUrl: './summaries.html',
})
export class Summaries {
  private readonly api = inject(ApiService);
  private readonly collection = inject(CollectionService);
  protected readonly i18n = inject(I18nService);

  /** One tab per period, with its label and the text shown when a topic has no summary yet. */
  protected readonly tabs: {
    period: SummaryPeriod;
    label: TranslationKey;
    never: TranslationKey;
  }[] = [
    { period: 'daily', label: 'summaries.daily', never: 'summaries.never' },
    { period: 'weekly', label: 'summaries.weekly', never: 'summaries.neverWeekly' },
    { period: 'monthly', label: 'summaries.monthly', never: 'summaries.neverMonthly' },
  ];

  protected readonly today = new Date();
  protected readonly period = signal<SummaryPeriod>('daily');
  protected readonly topics = signal<TopicSummary[]>([]);
  protected readonly loadFailed = signal(false);
  /** The agent tip last copied, to say "Copied" on its button. */
  protected readonly copied = signal<string | null>(null);

  /** Counts under the title: the tips to try and the distinct articles they come from. */
  protected readonly stats = computed(() => {
    const points = this.topics().flatMap((topic) => topic.summary?.points ?? []);
    const articles = new Set(points.flatMap((point) => point.articles.map((a) => a.id)));
    return { tips: points.length, sources: articles.size };
  });

  constructor() {
    // Loads on creation, then again after each collection.
    effect(() => {
      this.collection.completed();
      untracked(() => this.reload());
    });
  }

  protected select(period: SummaryPeriod): void {
    this.period.set(period);
    this.topics.set([]); // never show last tab's summaries under the new tab
    this.reload();
  }

  private reload(): void {
    const period = this.period();
    this.api.getLatestSummaries(period).subscribe({
      next: (topics) => {
        // A slow answer for a tab the user already left is dropped.
        if (period !== this.period()) return;
        this.topics.set(topics);
        this.loadFailed.set(false);
      },
      error: () => this.loadFailed.set(true),
    });
  }

  protected copy(tip: string): void {
    navigator.clipboard?.writeText(tip).then(() => this.copied.set(tip));
  }

  protected neverKey(): TranslationKey {
    return this.tabs.find((tab) => tab.period === this.period())!.never;
  }

  /** "01", "02"…: the numbering style of the design. */
  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** The last day a week or month covers: period_end is excluded (midnight of the next one). */
  protected lastDay(summary: Summary): Date {
    return new Date(Date.parse(summary.period_end) - 1);
  }

  /** ISO week number of the summary's week (weeks start on Monday, week 1 holds January 4). */
  protected weekNumber(summary: Summary): number {
    const start = new Date(summary.period_start);
    const day = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7)); // Thursday of that week
    const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
    return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  }
}
