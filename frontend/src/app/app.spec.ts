import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { I18nService } from './core/i18n/i18n.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the backend state', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController).expectOne('/api/health').flush({ status: 'ok' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('strong')?.textContent).toBe('ok');
  });

  it('translates the page when the language changes', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/health')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('strong')?.textContent).toBe('unreachable');

    TestBed.inject(I18nService).setLanguage('fr');
    await fixture.whenStable();
    expect(compiled.querySelector('strong')?.textContent).toBe('injoignable');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('selects the language saved in the browser on start', async () => {
    localStorage.setItem('language', 'fr');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect(select.value).toBe('fr');
  });
});
