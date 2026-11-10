import { Injectable, inject, signal } from '@angular/core';
import { ApiService, Run } from './api.service';
import { I18nService } from './i18n/i18n.service';

/**
 * State of the collection, shared by the whole app: the Collect button in the header starts it,
 * the status bar shows how it went, and the pages reload their data when one finishes.
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  /** True while a collection runs: the button is disabled to avoid two runs at once. */
  readonly running = signal(false);
  /** Last finished collection: loaded from the backend on start, replaced after each run. */
  readonly lastRun = signal<Run | null>(null);
  /** True once a run finished in this session: its counts are then shown in the status bar. */
  readonly ranHere = signal(false);
  /** True when the request itself failed (backend down, server error). */
  readonly requestFailed = signal(false);
  /**
   * Goes up by one after each finished run. A page reads it in an effect to reload its data:
   * the effect runs once on creation (first load), then after every collection.
   */
  readonly completed = signal(0);

  constructor() {
    this.api.getLatestRun().subscribe({
      next: (run) => this.lastRun.set(run),
      error: () => {}, // the status bar already says when the backend is unreachable
    });
  }

  collect(): void {
    this.running.set(true);
    this.requestFailed.set(false);
    this.api.startRun(this.i18n.language()).subscribe({
      next: (run) => {
        this.lastRun.set(run);
        this.ranHere.set(true);
        this.running.set(false);
        this.completed.update((n) => n + 1);
      },
      error: () => {
        this.requestFailed.set(true);
        this.running.set(false);
      },
    });
  }
}
