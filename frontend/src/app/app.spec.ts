import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Run } from './core/api.service';
import { I18nService } from './core/i18n/i18n.service';

const RUN: Run = {
  id: 1,
  started_at: '2026-11-09T07:41:00Z',
  finished_at: '2026-11-09T07:42:00Z',
  status: 'success',
  articles_fetched: 12,
  articles_judged: 10,
  articles_relevant: 3,
  summaries_created: 2,
  error: 'Real Python: 403 Forbidden',
};

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('shows the backend state and translates it when the language changes', async () => {
    const fixture = TestBed.createComponent(App);
    http.expectOne('/api/health').flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.backend strong')?.textContent).toBe('unreachable');

    TestBed.inject(I18nService).setLanguage('fr');
    await fixture.whenStable();
    expect(compiled.querySelector('.backend strong')?.textContent).toBe('injoignable');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('switches the language with the EN / FR buttons, starting from the saved one', async () => {
    localStorage.setItem('language', 'fr');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const pressed = () => compiled.querySelector('.languages button.active')?.textContent?.trim();
    expect(pressed()).toBe('FR');

    (compiled.querySelector('.languages button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(pressed()).toBe('EN');
    expect(TestBed.inject(I18nService).language()).toBe('en');
  });

  it('shows the last collection, then the counts of a collection run from the header', async () => {
    const fixture = TestBed.createComponent(App);
    http.expectOne('/api/runs/latest').flush(RUN);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const run = () => compiled.querySelector('.run')!;
    expect(run().textContent).toContain('Last collection');
    expect(run().textContent).toContain('2026');
    expect(run().querySelector('.counts')).toBeNull(); // old news: no counts

    (compiled.querySelector('app-collect-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(run().textContent).toContain('Collecting…');

    http.expectOne((req) => req.url === '/api/runs').flush(RUN);
    await fixture.whenStable();
    expect(run().querySelector('.counts')?.textContent).toContain('12 new articles');
    expect(run().querySelector('.counts')?.textContent).toContain('3 relevant articles out of 10');
    expect(run().querySelector('.counts')?.textContent).toContain('2 summaries written');
    expect(run().querySelector('pre')?.textContent).toContain('Real Python');
  });

  it('says when the collection request fails', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    (compiled.querySelector('app-collect-button button') as HTMLButtonElement).click();
    http
      .expectOne((req) => req.url === '/api/runs')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(compiled.querySelector('.run .error')?.textContent).toContain('The collection failed.');
  });
});
