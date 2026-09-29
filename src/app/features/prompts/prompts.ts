import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Prompt } from '../../core/models/prompt.model';
import { AuthService } from '../../core/services/auth.service';
import { PromptsService } from '../../core/services/prompts.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

/** Rows per page for the client-side pager below - see the matching constant in RuleSetsComponent for why prompts are paginated on the frontend rather than the backend. */
const PAGE_SIZE = 20;

@Component({
  selector: 'app-prompts',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './prompts.html',
  styleUrl: './prompts.css',
})
export class PromptsComponent implements OnInit {
  protected readonly promptsService = inject(PromptsService);
  protected readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  protected readonly page = signal(1);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.promptsService.prompts().length / PAGE_SIZE)),
  );

  /** The current page's slice of `promptsService.prompts()` - what the table actually renders. */
  protected readonly pagedPrompts = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.promptsService.prompts().slice(start, start + PAGE_SIZE);
  });

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
