import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ApiService, TopicDailySummary } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';

/** The latest daily summary of each topic: what is new since the previous one. */
@Component({
  selector: 'app-daily-summaries',
  imports: [DatePipe],
  styleUrl: './daily-summaries.scss',
  templateUrl: './daily-summaries.html',
})
export class DailySummaries {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  protected readonly topics = signal<TopicDailySummary[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.reload();
  }

  /** Public: the page calls it after a collection. */
  reload(): void {
    this.api.getLatestSummaries().subscribe({
      next: (topics) => {
        this.topics.set(topics);
        this.loadFailed.set(false);
      },
      error: () => this.loadFailed.set(true),
    });
  }
}
