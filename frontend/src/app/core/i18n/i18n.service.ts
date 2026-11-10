import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { Injectable, effect, signal } from '@angular/core';
import { DEFAULT_LANGUAGE, Language, TranslationKey, translations } from './translations';

const STORAGE_KEY = 'language';

// English date formats ship with Angular; French ones must be registered for the date pipe.
registerLocaleData(localeFr);

/** Holds the current language and translates texts. The choice is remembered in the browser. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages: Language[] = ['en', 'fr'];
  readonly language = signal<Language>(this.loadLanguage());

  constructor() {
    effect(() => {
      const language = this.language();
      document.documentElement.lang = language;
      localStorage.setItem(STORAGE_KEY, language);
    });
  }

  /** Text for `key` in the current language. Called from templates, it updates when the language changes. */
  t(key: TranslationKey): string {
    return translations[this.language()][key];
  }

  setLanguage(language: Language): void {
    this.language.set(language);
  }

  private loadLanguage(): Language {
    const saved = localStorage.getItem(STORAGE_KEY);
    return this.languages.find((language) => language === saved) ?? DEFAULT_LANGUAGE;
  }
}
