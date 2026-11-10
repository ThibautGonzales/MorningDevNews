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

  it('starts a collection in the current language and is disabled until it ends', async () => {
    const fixture = TestBed.createComponent(CollectButton);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.textContent).toContain('Collect');

    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Collecting…');

    const request = TestBed.inject(HttpTestingController).expectOne(
      (req) => req.url === '/api/runs',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('language')).toBe('en');
    request.flush({ id: 1, status: 'success' });
    await fixture.whenStable();

    expect(button.disabled).toBe(false);
  });
});
