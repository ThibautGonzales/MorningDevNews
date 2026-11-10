import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RelevantArticles } from './relevant-articles';

describe('RelevantArticles', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RelevantArticles],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('lists the articles of each topic, and says when a topic has none', async () => {
    const fixture = TestBed.createComponent(RelevantArticles);
    fixture.detectChanges(); // runs the effect that loads the articles
    TestBed.inject(HttpTestingController)
      .expectOne('/api/articles/relevant')
      .flush([
        {
          topic_id: 1,
          topic_name: 'AI / LLM',
          articles: [
            {
              id: 7,
              title: 'llm-anthropic 0.31',
              url: 'https://example.com/llm',
              published_at: '2026-11-10T08:00:00',
              source_name: 'Simon Willison',
              relevance_reason: 'New release of a developer tool.',
            },
          ],
        },
        { topic_id: 2, topic_name: 'Full stack', articles: [] },
      ]);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const link = compiled.querySelector('.list a')!;
    expect(link.textContent).toContain('llm-anthropic 0.31');
    expect(link.getAttribute('href')).toBe('https://example.com/llm');
    expect(compiled.querySelector('.list .label')?.textContent).toContain('Simon Willison');
    expect(compiled.querySelector('.reason')?.textContent).toContain('developer tool');
    expect(compiled.querySelector('.empty')?.textContent).toContain('No relevant article yet.');
  });

  it('formats dates in French when the language is French', async () => {
    localStorage.setItem('language', 'fr');
    const fixture = TestBed.createComponent(RelevantArticles);
    fixture.detectChanges(); // runs the effect that loads the articles
    TestBed.inject(HttpTestingController)
      .expectOne('/api/articles/relevant')
      .flush([
        {
          topic_id: 1,
          topic_name: 'AI / LLM',
          articles: [
            {
              id: 7,
              title: 'T',
              url: 'u',
              published_at: '2026-11-10T08:00:00',
              source_name: 'S',
              relevance_reason: null,
            },
          ],
        },
      ]);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.list .label')?.textContent,
    ).toContain('nov.');
  });
});
