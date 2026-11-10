import { Routes } from '@angular/router';
import { RelevantArticles } from './articles/relevant-articles';
import { LlmSettingsForm } from './settings/llm-settings';
import { Summaries } from './summaries/summaries';

/** One page per use: the morning brief, the articles behind it, and the LLM setup. */
export const routes: Routes = [
  { path: '', component: Summaries },
  { path: 'articles', component: RelevantArticles },
  { path: 'settings', component: LlmSettingsForm },
  { path: '**', redirectTo: '' },
];
