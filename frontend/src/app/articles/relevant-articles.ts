import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ApiService, TopicArticles } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';

/** The relevant articles of the last 7 days, one section per topic. */
@Component({
  selector: 'app-relevant-articles',
  imports: [DatePipe],
  styleUrl: './relevant-articles.scss',
  templateUrl: './relevant-articles.html',
})
export class RelevantArticles {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  protected readonly topics = signal<TopicArticles[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.reload();
  }

  /** Public: the page calls it after a collection. */
  reload(): void {
    this.api.getRelevantArticles().subscribe({
      next: (topics) => {
        this.topics.set(topics);
        this.loadFailed.set(false);
      },
      error: () => this.loadFailed.set(true),
    });
  }
}
