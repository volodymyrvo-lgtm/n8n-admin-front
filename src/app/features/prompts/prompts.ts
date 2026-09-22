import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Prompt } from '../../core/models/prompt.model';
import { AuthService } from '../../core/services/auth.service';
import { PromptsService } from '../../core/services/prompts.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

@Component({
  selector: 'app-prompts',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent],
  templateUrl: './prompts.html',
  styleUrl: './prompts.css',
})
export class PromptsComponent implements OnInit {
  protected readonly promptsService = inject(PromptsService);
  protected readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  ngOnInit(): void {
    this.promptsService.loadPrompts();
  }

  protected deletePrompt(prompt: Prompt): void {
    // Defense in depth - the delete button itself is only rendered for
    // admins (see prompts.html), but guard the handler too in case it's
    // ever invoked another way.
    if (!this.authService.isAdmin()) {
      return;
    }

    const message = this.translate.instant('prompts.deleteConfirm', { name: prompt.name });
    if (!confirm(message)) {
      return;
    }

    this.promptsService.deletePrompt(prompt.id, {
      onSuccess: () => {
        this.toast.success(this.translate.instant('prompts.toast.deleted'));
      },
      onError: () => {
        this.toast.error(this.translate.instant('toast.genericError'));
      },
    });
  }
}
