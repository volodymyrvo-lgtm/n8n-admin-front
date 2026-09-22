import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './core/services/language.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';

@Component({
  imports: [RouterOutlet, ToastContainerComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  /** Injected eagerly so the saved/browser language is applied on startup. */
  private readonly languageService = inject(LanguageService);
}
