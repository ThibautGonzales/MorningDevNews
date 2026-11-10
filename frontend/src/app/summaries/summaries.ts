import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ApiService, Summary, SummaryPeriod, TopicSummary } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations';

/** The latest summary of each topic, for the day, the week or the month picked in the tabs. */
@Component({
  selector: 'app-summaries',
  imports: [DatePipe],
  styleUrl: './summaries.scss',
  templateUrl: './summaries.html',
})
export class Summaries {
  private readonly api = inject(ApiService);
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

  protected readonly period = signal<SummaryPeriod>('daily');
  protected readonly topics = signal<TopicSummary[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.reload();
  }

  protected select(period: SummaryPeriod): void {
    this.period.set(period);
    this.topics.set([]); // never show last tab's summaries under the new tab
    this.reload();
  }

  /** Public: the page calls it after a collection. */
  reload(): void {
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

  protected neverKey(): TranslationKey {
    return this.tabs.find((tab) => tab.period === this.period())!.never;
  }

  /** The last day a week or month covers: period_end is excluded (midnight of the next one). */
  protected lastDay(summary: Summary): Date {
    return new Date(Date.parse(summary.period_end) - 1);
  }
}
