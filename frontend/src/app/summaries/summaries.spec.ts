import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Summaries } from './summaries';

describe('Summaries', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Summaries],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the headline, the points with their sources, and topics without summary', async () => {
    const fixture = TestBed.createComponent(Summaries);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/summaries/latest?period=daily')
      .flush([
        {
          topic_id: 1,
          topic_name: 'AI / LLM',
          summary: {
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
        },
        { topic_id: 2, topic_name: 'Full stack', summary: null },
      ]);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.headline')?.textContent).toContain('A new SDK for agents.');
    expect(compiled.querySelector('li strong')?.textContent).toBe('Agent SDK 2.0');
    expect(compiled.querySelector('.tip')?.textContent).toContain('Ask your agent:');
    const link = compiled.querySelector('.sources a')!;
    expect(link.textContent).toBe('Agent SDK 2.0 is out');
    expect(link.getAttribute('href')).toBe('https://example.com/sdk');
    expect(compiled.querySelector('.empty')?.textContent).toContain('No summary yet');
  });

  it('says when the summaries cannot be loaded', async () => {
    const fixture = TestBed.createComponent(Summaries);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/summaries/latest?period=daily')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error')?.textContent).toContain(
      'Could not load the summaries.',
    );
  });

  it('loads the weekly summaries when the Week tab is clicked', async () => {
    const fixture = TestBed.createComponent(Summaries);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/summaries/latest?period=daily').flush([]);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const weekTab = Array.from(compiled.querySelectorAll('.tabs button')).find(
      (button) => button.textContent?.trim() === 'Week',
    ) as HTMLButtonElement;
    weekTab.click();
    http.expectOne('/api/summaries/latest?period=weekly').flush([
      {
        topic_id: 1,
        topic_name: 'AI / LLM',
        summary: {
          period_start: '2026-11-02T12:00:00Z',
          period_end: '2026-11-09T12:00:00Z',
          headline: 'Agents got parallel tools this week.',
          points: [],
        },
      },
      { topic_id: 2, topic_name: 'Full stack', summary: null },
    ]);
    await fixture.whenStable();

    expect(weekTab.getAttribute('aria-pressed')).toBe('true');
    expect(compiled.querySelector('.headline')?.textContent).toContain('parallel tools');
    // Noon UTC keeps the expected days the same whatever the time zone of the test machine.
    expect(compiled.querySelector('.meta')?.textContent).toContain('November 2, 2026');
    expect(compiled.querySelector('.meta')?.textContent).toContain('November 9, 2026');
    expect(compiled.querySelector('.empty')?.textContent).toContain('No weekly summary yet');
  });
});
