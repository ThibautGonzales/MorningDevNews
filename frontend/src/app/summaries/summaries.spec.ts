import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { PeriodSummaries } from '../core/api.service';
import { Summaries } from './summaries';

/** A day with one summary for AI / LLM and none for Full stack. */
function daily(date: string, available: string[]): PeriodSummaries {
  return {
    period: 'daily',
    date,
    available_dates: available,
    topics: [
      {
        topic_id: 1,
        topic_name: 'AI / LLM',
        summaries: [
          {
            period_start: '2026-11-09T07:00:00Z',
            period_end: '2026-11-10T07:00:00Z',
            headline: 'A new SDK for agents.',
            points: [
              {
                tech: 'Agent SDK 2.0',
                whats_new: 'Tool calls run in parallel.',
                agent_tip: 'Ask it to migrate the tools to the 2.0 API.',
                articles: [
                  { id: 7, title: 'Agent SDK 2.0 is out', url: 'https://example.com/sdk' },
                ],
              },
            ],
          },
        ],
      },
      { topic_id: 2, topic_name: 'Full stack', summaries: [] },
    ],
  };
}

describe('Summaries', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Summaries],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  async function create() {
    const fixture = TestBed.createComponent(Summaries);
    fixture.detectChanges(); // runs the effect that loads the summaries
    await fixture.whenStable();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  it('shows the headline, the points with their sources, and topics without summary', async () => {
    const { fixture, http } = await create();
    http.expectOne('/api/summaries?period=daily').flush(daily('2026-11-10', ['2026-11-10']));
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.headline')?.textContent).toContain('A new SDK for agents.');
    expect(compiled.querySelector('.point h3')?.textContent).toBe('Agent SDK 2.0');
    expect(compiled.querySelector('.tip')?.textContent).toContain('Ask your agent:');
    const link = compiled.querySelector('.sources a')!;
    expect(link.textContent).toContain('Agent SDK 2.0 is out');
    expect(link.getAttribute('href')).toBe('https://example.com/sdk');
    expect(compiled.querySelector('.empty')?.textContent).toContain(
      'No summary for this topic on that day.',
    );
  });

  it('says when the summaries cannot be loaded', async () => {
    const { fixture, http } = await create();
    http
      .expectOne('/api/summaries?period=daily')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error')?.textContent).toContain(
      'Could not load the summaries.',
    );
  });

  it('goes to the previous date with a summary, then back to the latest', async () => {
    const { fixture, http } = await create();
    const available = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
    http.expectOne('/api/summaries?period=daily').flush(daily('2026-11-10', available));
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const [previous, next] = Array.from(compiled.querySelectorAll<HTMLButtonElement>('.step'));
    const latest = compiled.querySelector<HTMLButtonElement>('.latest')!;
    expect(next.disabled).toBe(true);
    expect(latest.disabled).toBe(true);

    previous.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?date=2026-11-09');
    http
      .expectOne('/api/summaries?period=daily&date=2026-11-09')
      .flush(daily('2026-11-09', available));
    await fixture.whenStable();
    expect(compiled.querySelector('.date-button')?.textContent).toContain('Monday 9 November 2026');
    expect(next.disabled).toBe(false);
    expect(latest.disabled).toBe(false);

    latest.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
    http.expectOne('/api/summaries?period=daily').flush(daily('2026-11-10', available));
  });

  it('opens a calendar where only the days with a summary can be picked', async () => {
    const { fixture, http } = await create();
    http
      .expectOne('/api/summaries?period=daily')
      .flush(daily('2026-11-10', ['2026-11-06', '2026-11-10']));
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('.date-button')!.click();
    await fixture.whenStable();
    const days = Array.from(compiled.querySelectorAll<HTMLButtonElement>('app-calendar .cell'));
    const enabled = days.filter((day) => !day.disabled && !day.classList.contains('outside'));
    expect(enabled.map((day) => day.textContent?.trim())).toEqual(['6', '10']);

    enabled[0].click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?date=2026-11-06');
    expect(compiled.querySelector('app-calendar')).toBeNull();
    http.expectOne('/api/summaries?period=daily&date=2026-11-06');
  });

  it('loads the weekly summaries when the Week tab is clicked', async () => {
    const { fixture, http } = await create();
    http.expectOne('/api/summaries?period=daily').flush(daily('2026-11-10', []));
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const weekTab = Array.from(compiled.querySelectorAll('.tabs button')).find(
      (button) => button.textContent?.trim() === 'Week',
    ) as HTMLButtonElement;
    weekTab.click();
    await fixture.whenStable();
    http.expectOne('/api/summaries?period=weekly').flush({
      period: 'weekly',
      date: '2026-11-02',
      available_dates: ['2026-11-02'],
      topics: [
        {
          topic_id: 1,
          topic_name: 'AI / LLM',
          summaries: [
            {
              period_start: '2026-11-02T12:00:00Z',
              period_end: '2026-11-09T12:00:00Z',
              headline: 'Agents got parallel tools this week.',
              points: [],
            },
          ],
        },
        { topic_id: 2, topic_name: 'Full stack', summaries: [] },
      ],
    } satisfies PeriodSummaries);
    await fixture.whenStable();

    expect(weekTab.getAttribute('aria-pressed')).toBe('true');
    expect(compiled.querySelector('.date-button')?.textContent).toContain('Week 45');
    expect(compiled.querySelector('.headline')?.textContent).toContain('parallel tools');
    // Noon UTC keeps the expected days the same whatever the time zone of the test machine.
    expect(compiled.querySelector('.meta')?.textContent).toContain('November 2, 2026');
    expect(compiled.querySelector('.meta')?.textContent).toContain('November 9, 2026');
    expect(compiled.querySelector('.empty')?.textContent).toContain(
      'No summary for this topic that week.',
    );
  });

  it('says when a period was never summarized', async () => {
    const { fixture, http } = await create();
    http.expectOne('/api/summaries?period=daily').flush({
      period: 'daily',
      date: '2026-11-10',
      available_dates: [],
      topics: [{ topic_id: 1, topic_name: 'AI / LLM', summaries: [] }],
    } satisfies PeriodSummaries);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty')?.textContent).toContain('No summary yet');
    expect(compiled.querySelector('.date-nav')).toBeNull();
  });
});
