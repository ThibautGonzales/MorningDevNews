import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LlmSettingsForm } from './llm-settings';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', default_model: 'claude-haiku-5-5' },
  { id: 'mistralai', label: 'Mistral AI', default_model: 'mistral-small-latest' },
];

describe('LlmSettingsForm', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<LlmSettingsForm>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LlmSettingsForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  /** Creates the form and answers its initial GET /api/settings with `settings`. */
  async function createWith(settings: object): Promise<void> {
    fixture = TestBed.createComponent(LlmSettingsForm);
    http.expectOne('/api/settings').flush({ providers: PROVIDERS, ...settings });
    await fixture.whenStable();
    compiled = fixture.nativeElement as HTMLElement;
  }

  const keyInput = () => compiled.querySelector('input[type=password]') as HTMLInputElement;
  const buttons = () => compiled.querySelectorAll<HTMLButtonElement>('.actions button');

  it('sends only the key when no provider is chosen, so the backend guesses it', async () => {
    await createWith({ provider: null, model: null, api_key_hint: null });
    keyInput().value = 'sk-ant-abcd1234';
    keyInput().dispatchEvent(new Event('input'));
    await fixture.whenStable(); // the browser re-renders after each input event
    buttons()[0].click();

    const request = http.expectOne('/api/settings');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ model: '', api_key: 'sk-ant-abcd1234' });
    request.flush({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      api_key_hint: '…1234',
      providers: PROVIDERS,
    });
    await fixture.whenStable();

    expect(keyInput().value).toBe('');
    expect(compiled.querySelector('.key-hint')?.textContent).toContain('Saved key: …1234');
    expect(compiled.querySelector('.success')?.textContent).toContain('Settings saved.');
  });

  it('shows the provider message when the test fails', async () => {
    await createWith({ provider: 'anthropic', model: 'claude-haiku-5-5', api_key_hint: '…1234' });
    buttons()[1].click();

    http
      .expectOne('/api/settings/test')
      .flush({ detail: 'invalid x-api-key' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();

    expect(compiled.querySelector('select')!.value).toBe('anthropic');
    const error = compiled.querySelector('.error')?.textContent;
    expect(error).toContain('The test failed.');
    expect(error).toContain('invalid x-api-key');
  });

  it('disables the test button until a key is saved', async () => {
    await createWith({ provider: null, model: null, api_key_hint: null });
    expect(buttons()[1].disabled).toBe(true);
  });
});
