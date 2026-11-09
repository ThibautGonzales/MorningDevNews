/** Languages the interface can be displayed in. English is the default. */
export type Language = 'en' | 'fr';

export const DEFAULT_LANGUAGE: Language = 'en';

/** English texts: the reference list of keys. */
const en = {
  'language.label': 'Language',
  'backend.label': 'Backend',
  'backend.checking': 'checking…',
  'backend.ok': 'ok',
  'backend.unreachable': 'unreachable',
};

export type TranslationKey = keyof typeof en;

/** Every language must define every key: TypeScript reports any missing one. */
export const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  fr: {
    'language.label': 'Langue',
    'backend.label': 'Backend',
    'backend.checking': 'vérification…',
    'backend.ok': 'ok',
    'backend.unreachable': 'injoignable',
  },
};
