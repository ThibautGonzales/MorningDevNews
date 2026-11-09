import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ApiService } from './core/api.service';
import { I18nService } from './core/i18n/i18n.service';
import { Language, TranslationKey } from './core/i18n/translations';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);

  /** Translation key of the backend state: ok if it answers, unreachable otherwise. */
  protected readonly backendStatus = toSignal(
    this.api.getHealth().pipe(
      map((health): TranslationKey => (health.status === 'ok' ? 'backend.ok' : 'backend.unreachable')),
      catchError(() => of<TranslationKey>('backend.unreachable')),
    ),
    { initialValue: 'backend.checking' as TranslationKey },
  );

  protected onLanguageChange(event: Event): void {
    this.i18n.setLanguage((event.target as HTMLSelectElement).value as Language);
  }
}
