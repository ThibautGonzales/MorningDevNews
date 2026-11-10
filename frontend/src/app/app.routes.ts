import { Routes } from '@angular/router';
import { LlmSettingsForm } from './settings/llm-settings';
import { Summaries } from './summaries/summaries';
import { TopicSettings } from './topics/topic-settings';

/** One page per use: the morning brief, what the watch follows, and the LLM setup. */
export const routes: Routes = [
  { path: '', component: Summaries },
  { path: 'topics', component: TopicSettings },
  { path: 'settings', component: LlmSettingsForm },
  { path: '**', redirectTo: '' },
];
