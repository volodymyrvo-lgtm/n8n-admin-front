import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AVAILABLE_LANGUAGES, AppLanguage, LanguageService } from '../../../core/services/language.service';

@Component({
  selector: 'app-language-switcher',
  imports: [TranslatePipe],
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css',
})
export class LanguageSwitcherComponent {
  protected readonly languageService = inject(LanguageService);
  protected readonly languages = AVAILABLE_LANGUAGES;

  selectLanguage(lang: AppLanguage): void {
    this.languageService.setLanguage(lang);
  }
}
