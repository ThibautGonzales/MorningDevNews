import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TopicSettings } from './topic-settings';
import { Topic } from '../core/api.service';

const TOPICS: Topic[] = [
  {
    id: 1,
    name: 'AI / LLM',
    description: 'Model releases.',
    enabled: true,
    sources: [
      {
        id: 10,
        name: 'Simon Willison',
        site_url: 'https://simonwillison.net',
        feed_url: 'https://simonwillison.net/atom/everything/',
        enabled: true,
        last_fetched_at: '2026-11-10T08:00:00Z',
        article_count: 12,
      },
      {
        id: 11,
        name: 'Typo',
        site_url: 'https://typo.dev',
        feed_url: 'https://typo.dev/feed',
        enabled: true,
        last_fetched_at: null,
        article_count: 0,
      },
    ],
  },
  { id: 2, name: 'Full stack', description: 'Angular.', enabled: false, sources: [] },
];

describe('TopicSettings', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TopicSettings>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TopicSettings],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TopicSettings);
    http.expectOne('/api/topics').flush(structuredClone(TOPICS));
    await fixture.whenStable();
    compiled = fixture.nativeElement as HTMLElement;
  });

  function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('lists the topics and opens the first one with its sources', () => {
    const items = compiled.querySelectorAll('.topic-list button');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2 sources');
    expect(items[1].textContent).toContain('paused');
    expect((compiled.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'Model releases.',
    );
    const rows = compiled.querySelectorAll('.source-list > li');
    expect(rows[0].textContent).toContain('Simon Willison');
    // Only the source without articles can be deleted.
    expect(rows[0].querySelector('.danger')).toBeNull();
    expect(rows[1].querySelector('.danger')).not.toBeNull();
  });

  it('saves the filtering instructions of the selected topic', async () => {
    type(compiled.querySelector('textarea')!, 'Only open models.');
    await fixture.whenStable();
    (compiled.querySelector('.topic-form .btn-primary') as HTMLButtonElement).click();

    const request = http.expectOne('/api/topics/1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'AI / LLM', description: 'Only open models.' });
    request.flush({ ...TOPICS[0], description: 'Only open models.' });
    await fixture.whenStable();
    expect(compiled.querySelector('.topic-form .success')?.textContent).toContain('Topic saved.');
  });

  it('adds a source and shows the backend reason when its feed cannot be found', async () => {
    const inputs = compiled.querySelectorAll<HTMLInputElement>('.add-source input');
    type(inputs[0], 'No feed');
    type(inputs[1], 'https://nofeed.dev');
    await fixture.whenStable();
    (compiled.querySelector('.add-source .btn-primary') as HTMLButtonElement).click();

    const request = http.expectOne('/api/topics/1/sources');
    expect(request.request.body).toEqual({
      name: 'No feed',
      site_url: 'https://nofeed.dev',
      feed_url: '',
    });
    request.flush(
      {
        detail:
          'No RSS/Atom feed is advertised on https://nofeed.dev. Enter the feed URL yourself.',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    const feedback = compiled.querySelector('.sources .error')?.textContent;
    expect(feedback).toContain('Could not save the source.');
    expect(feedback).toContain('Enter the feed URL yourself.');
  });

  it('pauses a source right away', async () => {
    const checkbox = compiled.querySelector<HTMLInputElement>('.source-list input[type=checkbox]')!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    const request = http.expectOne('/api/sources/10');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush({ ...TOPICS[0].sources[0], enabled: false });
    await fixture.whenStable();
    expect(compiled.querySelector('.source-list > li')?.classList).toContain('paused-row');
  });

  it('creates a new topic', async () => {
    (compiled.querySelector('.new-topic') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(compiled.querySelector('.sources')).toBeNull(); // sources come once the topic exists
    type(compiled.querySelector('.topic-form input')!, 'Security');
    type(compiled.querySelector('textarea')!, 'CVE news.');
    await fixture.whenStable();
    (compiled.querySelector('.topic-form .btn-primary') as HTMLButtonElement).click();

    const request = http.expectOne('/api/topics');
    expect(request.request.method).toBe('POST');
    request.flush({
      id: 3,
      name: 'Security',
      description: 'CVE news.',
      enabled: true,
      sources: [],
    });
    await fixture.whenStable();
    expect(compiled.querySelectorAll('.topic-list button').length).toBe(3);
    expect(compiled.querySelector('.sources')).not.toBeNull();
  });
});
