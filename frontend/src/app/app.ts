import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { CollectButton } from './collect/collect-button';
import { ApiService } from './core/api.service';
import { CollectionService } from './core/collection.service';
import { I18nService } from './core/i18n/i18n.service';
import { TranslationKey } from './core/i18n/translations';

/** The frame around every page: header with navigation, status bar, footer. */
@Component({
  selector: 'app-root',
  imports: [CollectButton, DatePipe, RouterLink, RouterLinkActive, RouterOutlet],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);
  protected readonly collection = inject(CollectionService);

  protected readonly links: { path: string; label: TranslationKey }[] = [
    { path: '/', label: 'nav.summaries' },
    { path: '/articles', label: 'nav.articles' },
    { path: '/settings', label: 'nav.settings' },
  ];

  /** Translation key of the backend state: ok if it answers, unreachable otherwise. */
  protected readonly backendStatus = toSignal(
    this.api.getHealth().pipe(
      map((health): TranslationKey =>
        health.status === 'ok' ? 'backend.ok' : 'backend.unreachable',
      ),
      catchError(() => of<TranslationKey>('backend.unreachable')),
    ),
    { initialValue: 'backend.checking' as TranslationKey },
  );
}
