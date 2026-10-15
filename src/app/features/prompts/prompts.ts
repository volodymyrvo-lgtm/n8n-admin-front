import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Prompt, PromptKind } from '../../core/models/prompt.model';
import { AuthService } from '../../core/services/auth.service';
import { PromptsService } from '../../core/services/prompts.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

/** Rows per page for the client-side pager below - see the matching constant in RuleSetsComponent for why prompts are paginated on the frontend rather than the backend. */
const PAGE_SIZE = 20;

/**
 * The prompts list - shared by the Content section (`/prompts`) and the
 * SEO section (`/seo/prompts`): the route's `data.kind` says which kind of
 * prompt to list (see PromptsService), and where its "new"/"edit" pages
 * live.
 */
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
  private readonly route = inject(ActivatedRoute);

  private readonly kind: PromptKind = this.route.snapshot.data?.['kind'] === 'seo' ? 'seo' : 'communication';
  /** Where this list's own routes live - the form pages are `<basePath>/new` and `<basePath>/:id/edit`. */
  protected readonly basePath = this.kind === 'seo' ? '/seo/prompts' : '/prompts';
  /** This section's prompts. */
  protected readonly prompts = this.promptsService.promptsFor(this.kind);

  protected readonly page = signal(1);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.prompts().length / PAGE_SIZE)),
  );

  /** The current page's slice of `prompts()` - what the table actually renders. */
  protected readonly pagedPrompts = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.prompts().slice(start, start + PAGE_SIZE);
  });

  ngOnInit(): void {
    this.promptsService.loadPrompts(this.kind);
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
