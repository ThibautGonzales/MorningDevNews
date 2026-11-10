import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Language } from './i18n/translations';

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
  summaries_created: number;
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

/** A site followed for a topic, read through its RSS/Atom feed. */
export interface TopicSource {
  id: number;
  name: string;
  site_url: string;
  feed_url: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  /** Articles stored from this source. Only a source without articles can be deleted. */
  article_count: number;
}

/** A watch subject. The description holds the filtering instructions read by the LLM. */
export interface Topic {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  sources: TopicSource[];
}

/** What the forms send. A missing field is left unchanged by the backend. */
export interface TopicUpdate {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export interface SourceUpdate {
  name?: string;
  site_url?: string;
  /** Empty or missing when adding: the backend looks for the feed on the site. */
  feed_url?: string;
  enabled?: boolean;
}

/** An article a summary point comes from. */
export interface SummaryArticle {
  id: number;
  title: string;
  url: string;
}

/** One technology in a summary, and how to ask a coding agent to use it. */
export interface SummaryPoint {
  tech: string;
  whats_new: string;
  agent_tip: string;
  articles: SummaryArticle[];
}

/** The periods the backend summarizes: every collection, every week, every month. */
export type SummaryPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * What the LLM wrote for one topic over the period. For a daily summary, the period runs from
 * the previous summary to the collection; for a week or a month, period_end is excluded
 * (midnight on the next Monday, or on the 1st of the next month).
 */
export interface Summary {
  period_start: string;
  period_end: string;
  headline: string;
  points: SummaryPoint[];
}

/** One topic with its summaries of the date: usually one, several if more collections ran that day. */
export interface TopicSummaries {
  topic_id: number;
  topic_name: string;
  summaries: Summary[];
}

/** The summaries of one day, week or month, and the dates the page can move to. */
export interface PeriodSummaries {
  period: SummaryPeriod;
  /** 'YYYY-MM-DD' on the local calendar: the day, the Monday of the week or the 1st of the month. */
  date: string;
  /** Every date of this period that has a summary, oldest first. */
  available_dates: string[];
  topics: TopicSummaries[];
}

/** Single access point to the backend: every HTTP call goes through here. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getHealth(): Observable<Health> {
    return this.http.get<Health>('/api/health');
  }

  /**
   * Collects every enabled source now, then judges and summarizes the new articles.
   * The summaries are written in `language`. The response arrives once everything is finished.
   */
  startRun(language: Language): Observable<Run> {
    return this.http.post<Run>('/api/runs', null, { params: { language } });
  }

  /** The last finished collection, or null if none ran yet. */
  getLatestRun(): Observable<Run | null> {
    return this.http.get<Run | null>('/api/runs/latest');
  }

  /** The summaries of the period holding `date` ('YYYY-MM-DD'); without a date, the latest ones. */
  getSummaries(period: SummaryPeriod, date: string | null): Observable<PeriodSummaries> {
    const params: Record<string, string> = { period };
    if (date) params['date'] = date;
    return this.http.get<PeriodSummaries>('/api/summaries', { params });
  }

  /** Every topic, disabled ones included, with its sources. */
  getTopics(): Observable<Topic[]> {
    return this.http.get<Topic[]>('/api/topics');
  }

  createTopic(topic: { name: string; description: string }): Observable<Topic> {
    return this.http.post<Topic>('/api/topics', topic);
  }

  updateTopic(id: number, update: TopicUpdate): Observable<Topic> {
    return this.http.put<Topic>(`/api/topics/${id}`, update);
  }

  /** Adds a site to a topic. Fails (HTTP 400) when its feed cannot be found or read. */
  addSource(topicId: number, source: SourceUpdate): Observable<TopicSource> {
    return this.http.post<TopicSource>(`/api/topics/${topicId}/sources`, source);
  }

  updateSource(id: number, update: SourceUpdate): Observable<TopicSource> {
    return this.http.put<TopicSource>(`/api/sources/${id}`, update);
  }

  /** Only for a source without articles (HTTP 409 otherwise). */
  deleteSource(id: number): Observable<void> {
    return this.http.delete<void>(`/api/sources/${id}`);
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
