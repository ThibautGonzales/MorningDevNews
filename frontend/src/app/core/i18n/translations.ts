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
  'collect.button': 'Collect',
  'collect.running': 'Collecting…',
  'collect.newArticles': 'new articles',
  'collect.sourceErrors': 'Some sources failed:',
  'collect.failed': 'The collection failed.',
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
    'collect.button': 'Collecter',
    'collect.running': 'Collecte en cours…',
    'collect.newArticles': 'nouveaux articles',
    'collect.sourceErrors': 'Certaines sources ont échoué :',
    'collect.failed': 'La collecte a échoué.',
  },
};
