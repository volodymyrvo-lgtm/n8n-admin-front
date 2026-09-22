import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export const AVAILABLE_LANGUAGES = ['en', 'ru'] as const;
export type AppLanguage = (typeof AVAILABLE_LANGUAGES)[number];

const STORAGE_KEY = 'app-language';
const DEFAULT_LANGUAGE: AppLanguage = 'en';

/**
 * Wraps TranslateService with app-specific defaults: persists the selected
 * language to localStorage and falls back to the browser language on first
 * visit.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly currentLanguage = signal<AppLanguage>(this.resolveInitialLanguage());

  constructor() {
    this.translate.addLangs([...AVAILABLE_LANGUAGES]);
    this.translate.use(this.currentLanguage());
    document.documentElement.lang = this.currentLanguage();
  }

  setLanguage(language: AppLanguage): void {
    if (language === this.currentLanguage()) {
      return;
    }

    this.translate.use(language).subscribe({
      next: () => {
        this.currentLanguage.set(language);
        document.documentElement.lang = language;
        try {
          localStorage.setItem(STORAGE_KEY, language);
        } catch {
          // localStorage may be unavailable (e.g. private browsing) - ignore.
        }
      },
      // If the translation file failed to load, stay on the current
      // language instead of silently leaving the UI half-switched.
      error: () => {
        console.warn(`Failed to switch language to "${language}" - keeping "${this.currentLanguage()}".`);
      },
    });
  }

  private resolveInitialLanguage(): AppLanguage {
    const saved = this.readSavedLanguage();
    if (saved) {
      return saved;
    }

    const browserLang = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : undefined;
    if (this.isSupportedLanguage(browserLang)) {
      return browserLang;
    }

    return DEFAULT_LANGUAGE;
  }

  private readSavedLanguage(): AppLanguage | undefined {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return this.isSupportedLanguage(saved) ? saved : undefined;
    } catch {
      return undefined;
    }
  }

  private isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
    return !!value && (AVAILABLE_LANGUAGES as readonly string[]).includes(value);
  }
}
