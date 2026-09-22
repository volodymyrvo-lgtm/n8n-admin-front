import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  let translateStub: {
    addLangs: ReturnType<typeof vi.fn>;
    use: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    translateStub = {
      addLangs: vi.fn(),
      use: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: TranslateService, useValue: translateStub }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to English when nothing is saved and the browser language is unsupported', () => {
    const service = TestBed.inject(LanguageService);

    expect(service.currentLanguage()).toBe('en');
  });

  it('switches language and persists the choice when the translation loads successfully', () => {
    const service = TestBed.inject(LanguageService);

    service.setLanguage('ru');

    expect(service.currentLanguage()).toBe('ru');
    expect(localStorage.getItem('app-language')).toBe('ru');
  });

  it('keeps the current language when the switch fails to load', () => {
    translateStub.use.mockReturnValue(of({}));
    const service = TestBed.inject(LanguageService);

    // The first call (in the constructor) already resolved; make the
    // next one (from setLanguage) fail.
    translateStub.use.mockReturnValue(throwError(() => new Error('network error')));

    service.setLanguage('ru');

    expect(service.currentLanguage()).toBe('en');
    expect(localStorage.getItem('app-language')).toBeNull();
  });

  it('does nothing when asked to switch to the language that is already active', () => {
    const service = TestBed.inject(LanguageService);
    translateStub.use.mockClear();

    service.setLanguage('en');

    expect(translateStub.use).not.toHaveBeenCalled();
  });
});
