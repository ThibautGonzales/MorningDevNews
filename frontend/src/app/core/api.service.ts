import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Health {
  status: string;
}

/** A collection run, as returned by the backend (field names match the Python model). */
export interface Run {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  articles_fetched: number;
  articles_judged: number;
  articles_relevant: number;
  error: string | null;
}

/** An LLM provider the backend knows, with the model used when none is typed. */
export interface Provider {
  id: string;
  label: string;
  default_model: string;
}

/** The LLM settings. The API key never comes back: only its last 4 characters (api_key_hint). */
export interface LlmSettings {
  provider: string | null;
  model: string | null;
  api_key_hint: string | null;
  providers: Provider[];
}

/** What the settings form sends. A missing field is left unchanged by the backend. */
export interface LlmSettingsUpdate {
  provider?: string;
  model?: string;
  api_key?: string;
}

/** An article the LLM judged relevant for its topic. */
export interface RelevantArticle {
  id: number;
  title: string;
  url: string;
  published_at: string | null;
  source_name: string;
  relevance_reason: string | null;
}

/** One topic with its relevant articles of the last 7 days, most recent first. */
export interface TopicArticles {
  topic_id: number;
  topic_name: string;
  articles: RelevantArticle[];
}

/** Single access point to the backend: every HTTP call goes through here. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getHealth(): Observable<Health> {
    return this.http.get<Health>('/api/health');
  }

  /** Collects every enabled source now. The response arrives once the collection is finished. */
  startRun(): Observable<Run> {
    return this.http.post<Run>('/api/runs', null);
  }

  getRelevantArticles(): Observable<TopicArticles[]> {
    return this.http.get<TopicArticles[]>('/api/articles/relevant');
  }

  getSettings(): Observable<LlmSettings> {
    return this.http.get<LlmSettings>('/api/settings');
  }

  updateSettings(update: LlmSettingsUpdate): Observable<LlmSettings> {
    return this.http.put<LlmSettings>('/api/settings', update);
  }

  /** Sends a tiny prompt with the saved settings. Fails with the provider's message (HTTP 400). */
  testSettings(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>('/api/settings/test', null);
  }
}
