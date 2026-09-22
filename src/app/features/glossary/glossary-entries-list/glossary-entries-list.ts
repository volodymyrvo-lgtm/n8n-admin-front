import { Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GlossaryEntry, targetLanguageFieldKey } from '../../../core/models/glossary.model';
import { AuthService } from '../../../core/services/auth.service';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

/**
 * One glossary's terms (`/glossary/:id`) - the page you land on after
 * opening a glossary from GlossaryListComponent. Editing the glossary's
 * own fields (name, language pair, purpose, instructions) happens on a
 * separate page (`/glossary/:id/edit`, linked from here) since those
 * are a different resource from its terms.
 */
@Component({
  selector: 'app-glossary-entries-list',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent],
  templateUrl: './glossary-entries-list.html',
  styleUrl: './glossary-entries-list.css',
})
export class GlossaryEntriesListComponent implements OnInit {
  protected readonly glossariesService = inject(GlossariesService);
  protected readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  protected readonly glossaryId = this.route.snapshot.paramMap.get('id')!;
  protected readonly glossary = computed(() =>
    this.glossariesService.glossaries().find((glossary) => glossary.id === this.glossaryId),
  );

  ngOnInit(): void {
    // The glossaries list is small (one row per language pair) - always
    // reload it here too, so a direct navigation/refresh on this page
    // still resolves the glossary's own fields for the header, not
    // just its entries.
    this.glossariesService.loadGlossaries();
    this.glossariesService.loadEntries(this.glossaryId);
  }

  /** The entry's recommended terms, reading whichever `recommended_*` field matches this glossary's target language. */
  protected recommendedTerms(entry: GlossaryEntry): string[] {
    const glossary = this.glossary();
    if (!glossary) {
      return [];
    }
    const key = `recommended_${targetLanguageFieldKey(glossary.allGlossRules.target_language)}`;
    return (entry as unknown as Record<string, string[] | undefined>)[key] ?? [];
  }

  protected deleteEntry(entry: GlossaryEntry): void {
    if (!this.authService.isAdmin()) {
      return;
    }

    const message = this.translate.instant('glossary.entry.deleteConfirm', { name: entry.english_term });
    if (!confirm(message)) {
      return;
    }

    this.glossariesService.deleteEntry(this.glossaryId, entry.id, {
      onSuccess: () => {
        this.toast.success(this.translate.instant('glossary.entry.toast.deleted'));
      },
      onError: (error) => {
        // The backend refuses to delete a glossary's last remaining
        // entry - surface that distinctly rather than a generic error.
        const status = (error as { status?: number } | null)?.status;
        const messageKey = status === 400 || status === 409 ? 'glossary.entry.lastEntryError' : 'toast.genericError';
        this.toast.error(this.translate.instant(messageKey));
      },
    });
  }
}
