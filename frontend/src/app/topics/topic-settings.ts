import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiService, Topic, TopicSource } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations';

/** A feedback line under a form: a translated text, plus the backend's reason on an error. */
interface Feedback {
  error: boolean;
  key: TranslationKey;
  detail?: string;
}

/** The fields of a source form, used both to add a source and to edit one. */
interface SourceFields {
  name: string;
  site_url: string;
  feed_url: string;
}

const EMPTY_SOURCE: SourceFields = { name: '', site_url: '', feed_url: '' };

/** Reads the value of the input, textarea or checkbox that fired an event. */
function valueOf(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

/**
 * Topic settings page: the topics of the brief, their filtering instructions and their sources.
 * The topic list is on the left; the selected topic (or a new one) is edited on the right.
 */
@Component({
  selector: 'app-topic-settings',
  imports: [DatePipe],
  styleUrl: './topic-settings.scss',
  templateUrl: './topic-settings.html',
})
export class TopicSettings {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  protected readonly topics = signal<Topic[]>([]);
  protected readonly loadFailed = signal(false);
  /** The topic shown on the right, or 'new' while creating one. */
  protected readonly selectedId = signal<number | 'new' | null>(null);
  protected readonly selected = computed(
    () => this.topics().find((t) => t.id === this.selectedId()) ?? null,
  );

  // Topic form.
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly topicBusy = signal(false);
  protected readonly topicFeedback = signal<Feedback | null>(null);

  // Source forms: the "add" form, and the source being edited in its row (one at a time).
  protected readonly newSource = signal<SourceFields>(EMPTY_SOURCE);
  protected readonly editedId = signal<number | null>(null);
  protected readonly editedSource = signal<SourceFields>(EMPTY_SOURCE);
  protected readonly sourceBusy = signal(false);
  protected readonly sourceFeedback = signal<Feedback | null>(null);

  protected readonly valueOf = valueOf;

  constructor() {
    this.api.getTopics().subscribe({
      next: (topics) => {
        this.topics.set(topics);
        if (topics.length) {
          this.select(topics[0].id);
        } else {
          this.startNew();
        }
      },
      error: () => this.loadFailed.set(true),
    });
  }

  /** "01", "02"…: the numbering used on every page. */
  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected activeSources(topic: Topic): number {
    return topic.sources.filter((s) => s.enabled).length;
  }

  // ---------- Topics ----------

  protected select(id: number): void {
    const topic = this.topics().find((t) => t.id === id)!;
    this.selectedId.set(id);
    this.name.set(topic.name);
    this.description.set(topic.description);
    this.resetSourceForms();
    this.topicFeedback.set(null);
  }

  protected startNew(): void {
    this.selectedId.set('new');
    this.name.set('');
    this.description.set('');
    this.resetSourceForms();
    this.topicFeedback.set(null);
  }

  protected saveTopic(): void {
    const id = this.selectedId();
    const fields = { name: this.name(), description: this.description() };
    const request =
      id === 'new' ? this.api.createTopic(fields) : this.api.updateTopic(id as number, fields);
    this.topicBusy.set(true);
    request.subscribe({
      next: (topic) => {
        this.storeTopic(topic);
        this.select(topic.id);
        this.topicFeedback.set({ error: false, key: 'topics.saved' });
        this.topicBusy.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.topicFeedback.set(this.failure('topics.saveFailed', err));
        this.topicBusy.set(false);
      },
    });
  }

  /** Pauses or resumes a topic right away, without touching the unsaved fields of the form. */
  protected toggleTopic(topic: Topic, enabled: boolean): void {
    this.api.updateTopic(topic.id, { enabled }).subscribe({
      next: (updated) => this.storeTopic(updated),
      error: (err: HttpErrorResponse) =>
        this.topicFeedback.set(this.failure('topics.saveFailed', err)),
    });
  }

  // ---------- Sources ----------

  protected setNewSource(field: keyof SourceFields, event: Event): void {
    this.newSource.update((s) => ({ ...s, [field]: valueOf(event) }));
  }

  protected setEditedSource(field: keyof SourceFields, event: Event): void {
    this.editedSource.update((s) => ({ ...s, [field]: valueOf(event) }));
  }

  /** Adds the source. The backend reads its feed first, which can take a few seconds. */
  protected addSource(topic: Topic): void {
    this.sourceBusy.set(true);
    this.sourceFeedback.set(null);
    this.api.addSource(topic.id, this.newSource()).subscribe({
      next: (source) => {
        this.storeSources(topic.id, [...topic.sources, source]);
        this.newSource.set(EMPTY_SOURCE);
        this.sourceDone();
      },
      error: (err: HttpErrorResponse) => this.sourceFailed(err),
    });
  }

  protected editSource(source: TopicSource): void {
    this.editedId.set(source.id);
    this.editedSource.set({
      name: source.name,
      site_url: source.site_url,
      feed_url: source.feed_url ?? '',
    });
    this.sourceFeedback.set(null);
  }

  protected cancelEdit(): void {
    this.editedId.set(null);
  }

  protected saveSource(topic: Topic, source: TopicSource): void {
    this.sourceBusy.set(true);
    this.sourceFeedback.set(null);
    this.api.updateSource(source.id, this.editedSource()).subscribe({
      next: (updated) => {
        this.replaceSource(topic, updated);
        this.editedId.set(null);
        this.sourceDone();
      },
      error: (err: HttpErrorResponse) => this.sourceFailed(err),
    });
  }

  protected toggleSource(topic: Topic, source: TopicSource, enabled: boolean): void {
    this.api.updateSource(source.id, { enabled }).subscribe({
      next: (updated) => this.replaceSource(topic, updated),
      error: (err: HttpErrorResponse) => this.sourceFailed(err),
    });
  }

  protected deleteSource(topic: Topic, source: TopicSource): void {
    if (!confirm(`${this.i18n.t('topics.deleteConfirm')}\n${source.name}`)) {
      return;
    }
    this.api.deleteSource(source.id).subscribe({
      next: () =>
        this.storeSources(
          topic.id,
          topic.sources.filter((s) => s.id !== source.id),
        ),
      error: (err: HttpErrorResponse) => this.sourceFailed(err),
    });
  }

  // ---------- Local state ----------

  /** Puts a topic received from the backend in the list: replaces it, or adds a new one. */
  private storeTopic(topic: Topic): void {
    this.topics.update((topics) =>
      topics.some((t) => t.id === topic.id)
        ? topics.map((t) => (t.id === topic.id ? topic : t))
        : [...topics, topic],
    );
  }

  private storeSources(topicId: number, sources: TopicSource[]): void {
    this.topics.update((topics) => topics.map((t) => (t.id === topicId ? { ...t, sources } : t)));
  }

  private replaceSource(topic: Topic, source: TopicSource): void {
    this.storeSources(
      topic.id,
      topic.sources.map((s) => (s.id === source.id ? source : s)),
    );
  }

  private resetSourceForms(): void {
    this.newSource.set(EMPTY_SOURCE);
    this.editedId.set(null);
    this.sourceFeedback.set(null);
  }

  private sourceDone(): void {
    this.sourceFeedback.set({ error: false, key: 'topics.sourceSaved' });
    this.sourceBusy.set(false);
  }

  private sourceFailed(err: HttpErrorResponse): void {
    this.sourceFeedback.set(this.failure('topics.sourceFailed', err));
    this.sourceBusy.set(false);
  }

  /** FastAPI puts the reason in "detail", e.g. "No RSS/Atom feed is advertised on …". */
  private failure(key: TranslationKey, err: HttpErrorResponse): Feedback {
    const detail = err.error?.detail;
    return { error: true, key, detail: typeof detail === 'string' ? detail : undefined };
  }
}
