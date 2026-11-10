import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, LlmSettings, LlmSettingsUpdate } from '../core/api.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations';

/** A feedback line under the form: a translated text, or the raw message of a provider error. */
interface Feedback {
  error: boolean;
  key: TranslationKey;
  detail?: string;
}

/** Form where the user picks the LLM provider, the model and their API key. */
@Component({
  selector: 'app-llm-settings',
  styleUrl: './llm-settings.scss',
  templateUrl: './llm-settings.html',
})
export class LlmSettingsForm {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  /** Last settings received from the backend, null until loaded. */
  protected readonly saved = signal<LlmSettings | null>(null);

  // Form fields. The key field starts empty: the backend never sends the key back.
  protected readonly provider = signal('');
  protected readonly model = signal('');
  protected readonly apiKey = signal('');
  /** True once the user picks a provider: otherwise the backend guesses it from the key. */
  private providerChosen = false;

  protected readonly busy = signal(false);
  protected readonly feedback = signal<Feedback | null>(null);

  /** Shown in the empty model field: the default model of the selected provider. */
  protected readonly defaultModel = computed(
    () => this.saved()?.providers.find((p) => p.id === this.provider())?.default_model ?? '',
  );

  constructor() {
    this.api.getSettings().subscribe({
      next: (settings) => this.showSaved(settings),
      error: () => this.feedback.set({ error: true, key: 'settings.loadFailed' }),
    });
  }

  protected onProviderChange(event: Event): void {
    this.provider.set((event.target as HTMLSelectElement).value);
    this.providerChosen = true;
    this.model.set(''); // a model name of one provider means nothing to another
  }

  protected onModelInput(event: Event): void {
    this.model.set((event.target as HTMLInputElement).value);
  }

  protected onApiKeyInput(event: Event): void {
    this.apiKey.set((event.target as HTMLInputElement).value);
  }

  protected save(): void {
    const update: LlmSettingsUpdate = { model: this.model() };
    if (this.apiKey()) {
      update.api_key = this.apiKey();
    }
    if (this.provider() && (this.providerChosen || !this.apiKey())) {
      update.provider = this.provider();
    }
    this.busy.set(true);
    this.api.updateSettings(update).subscribe({
      next: (settings) => {
        this.showSaved(settings);
        this.feedback.set({ error: false, key: 'settings.saved' });
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => this.showError('settings.saveFailed', err),
    });
  }

  protected test(): void {
    this.busy.set(true);
    this.feedback.set(null);
    this.api.testSettings().subscribe({
      next: () => {
        this.feedback.set({ error: false, key: 'settings.testOk' });
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => this.showError('settings.testFailed', err),
    });
  }

  /** Puts the backend's values back in the form, after loading or saving. */
  private showSaved(settings: LlmSettings): void {
    this.saved.set(settings);
    this.provider.set(settings.provider ?? '');
    this.model.set(settings.model ?? '');
    this.apiKey.set('');
    this.providerChosen = false;
  }

  private showError(key: TranslationKey, err: HttpErrorResponse): void {
    // FastAPI puts the reason in "detail", e.g. the provider's "invalid x-api-key".
    this.feedback.set({ error: true, key, detail: err.error?.detail });
    this.busy.set(false);
  }
}
