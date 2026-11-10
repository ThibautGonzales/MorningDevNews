import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectButton } from './collect-button';

describe('CollectButton', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CollectButton],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('disables the button while collecting, then shows the new articles count', async () => {
    const fixture = TestBed.createComponent(CollectButton);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button')!;

    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);

    const request = TestBed.inject(HttpTestingController).expectOne('/api/runs');
    expect(request.request.method).toBe('POST');
    request.flush({
      id: 1,
      started_at: '',
      finished_at: '',
      status: 'success',
      articles_fetched: 12,
      articles_judged: 10,
      articles_relevant: 3,
      error: 'Real Python: 403 Forbidden',
    });
    await fixture.whenStable();

    expect(button.disabled).toBe(false);
    expect(compiled.querySelector('.result')?.textContent).toContain('12 new articles');
    expect(compiled.querySelector('.relevance')?.textContent).toContain(
      '3 relevant articles out of 10',
    );
    expect(compiled.querySelector('pre')?.textContent).toContain('Real Python');
  });

  it('shows an error when the request fails', async () => {
    const fixture = TestBed.createComponent(CollectButton);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector('button')!.click();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/runs')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(compiled.querySelector('.error')?.textContent).toContain('The collection failed.');
  });
});
