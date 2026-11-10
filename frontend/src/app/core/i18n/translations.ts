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
  'collect.relevantOutOf': 'relevant articles out of',
  'collect.judged': 'judged',
  'settings.title': 'LLM settings',
  'settings.provider': 'Provider',
  'settings.providerGuessed': 'Guess from the key',
  'settings.apiKey': 'API key',
  'settings.apiKeySaved': 'Saved key:',
  'settings.model': 'Model',
  'settings.save': 'Save',
  'settings.test': 'Test',
  'settings.saved': 'Settings saved.',
  'settings.saveFailed': 'Could not save the settings.',
  'settings.testOk': 'The model answers: everything works.',
  'settings.testFailed': 'The test failed.',
  'settings.loadFailed': 'Could not load the settings.',
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
    'collect.relevantOutOf': 'articles pertinents sur',
    'collect.judged': 'jugés',
    'settings.title': 'Réglages du LLM',
    'settings.provider': 'Fournisseur',
    'settings.providerGuessed': 'Deviner d’après la clé',
    'settings.apiKey': 'Clé API',
    'settings.apiKeySaved': 'Clé enregistrée :',
    'settings.model': 'Modèle',
    'settings.save': 'Enregistrer',
    'settings.test': 'Tester',
    'settings.saved': 'Réglages enregistrés.',
    'settings.saveFailed': 'Impossible d’enregistrer les réglages.',
    'settings.testOk': 'Le modèle répond : tout fonctionne.',
    'settings.testFailed': 'Le test a échoué.',
    'settings.loadFailed': 'Impossible de charger les réglages.',
  },
};
