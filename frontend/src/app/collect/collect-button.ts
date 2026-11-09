import { Component, inject, signal } from '@angular/core';
import { ApiService, Run } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';

/** Button that starts a collection on the backend and shows how it went. */
@Component({
  selector: 'app-collect-button',
  styleUrl: './collect-button.scss',
  templateUrl: './collect-button.html',
})
export class CollectButton {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  /** True while the request is in flight: the button is disabled to avoid two runs at once. */
  protected readonly running = signal(false);
  /** Last finished run, or null before the first click. */
  protected readonly lastRun = signal<Run | null>(null);
  /** True when the request itself failed (backend down, server error). */
  protected readonly requestFailed = signal(false);

  protected collect(): void {
    this.running.set(true);
    this.requestFailed.set(false);
    this.api.startRun().subscribe({
      next: (run) => {
        this.lastRun.set(run);
        this.running.set(false);
      },
      error: () => {
        this.lastRun.set(null);
        this.requestFailed.set(true);
        this.running.set(false);
      },
    });
  }
}
