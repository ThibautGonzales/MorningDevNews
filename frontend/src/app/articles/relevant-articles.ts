import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService, TopicArticles } from '../core/api.service';
import { CollectionService } from '../core/collection.service';
import { I18nService } from '../core/i18n/i18n.service';

/** Articles page: the relevant articles of the last 7 days, one section per topic. */
@Component({
  selector: 'app-relevant-articles',
  imports: [DatePipe],
  styleUrl: './relevant-articles.scss',
  templateUrl: './relevant-articles.html',
  host: { '(window:scroll)': 'onScroll()' },
})
export class RelevantArticles {
  private readonly api = inject(ApiService);
  private readonly collection = inject(CollectionService);
  protected readonly i18n = inject(I18nService);

  protected readonly today = new Date();
  /** The backend keeps 7 days: today and the 6 before. */
  protected readonly weekAgo = new Date(Date.now() - 6 * 86_400_000);
  protected readonly topics = signal<TopicArticles[]>([]);
  protected readonly loadFailed = signal(false);
  /** Topic highlighted in the quick access: the one being read. */
  protected readonly activeTopic = signal<number | null>(null);

  protected readonly total = computed(() =>
    this.topics().reduce((sum, topic) => sum + topic.articles.length, 0),
  );

  constructor() {
    // Loads on creation, then again after each collection.
    effect(() => {
      this.collection.completed();
      untracked(() => this.reload());
    });
  }

  private reload(): void {
    this.api.getRelevantArticles().subscribe({
      next: (topics) => {
        this.topics.set(topics);
        this.loadFailed.set(false);
        this.activeTopic.set(topics[0]?.topic_id ?? null);
      },
      error: () => this.loadFailed.set(true),
    });
  }

  protected scrollTo(topicId: number): void {
    this.activeTopic.set(topicId);
    document.getElementById(`topic-${topicId}`)?.scrollIntoView({ behavior: 'smooth' });
  }

  /** The active topic is the last one whose title went past the top third of the screen. */
  protected onScroll(): void {
    const limit = window.innerHeight / 3;
    let active = this.topics()[0]?.topic_id ?? null;
    for (const topic of this.topics()) {
      const section = document.getElementById(`topic-${topic.topic_id}`);
      if (section && section.getBoundingClientRect().top <= limit) active = topic.topic_id;
    }
    // At the bottom of the page the last topic may never reach the top third.
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
    if (atBottom && window.scrollY > 0) active = this.topics().at(-1)?.topic_id ?? active;
    this.activeTopic.set(active);
  }

  /** "01", "02"…: the numbering style of the design. */
  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
