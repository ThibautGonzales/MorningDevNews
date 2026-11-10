import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DailySummaries } from './daily-summaries';

describe('DailySummaries', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DailySummaries],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the headline, the points with their sources, and topics without summary', async () => {
    const fixture = TestBed.createComponent(DailySummaries);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/summaries/latest')
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
    const fixture = TestBed.createComponent(DailySummaries);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/summaries/latest')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error')?.textContent).toContain(
      'Could not load the summaries.',
    );
  });
});
