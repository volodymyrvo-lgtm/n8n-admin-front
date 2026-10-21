import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Glossary } from '../../../core/models/glossary.model';
import { AuthService } from '../../../core/services/auth.service';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { ViewButtonComponent } from '../../../shared/components/view-button/view-button';
import { ViewModalComponent } from '../../../shared/components/view-modal/view-modal';

/**
 * Top-level list of glossaries (e.g. the EN -> AZ and EN -> RU
 * glossaries). Opening a glossary (GlossaryEntriesListComponent) is
 * where its terms are managed - this page only covers the glossaries
 * themselves (create/edit/delete).
 */
@Component({
  selector: 'app-glossary-list',
  imports: [RouterLink, TranslatePipe, DatePipe, EmptyStateComponent, SpinnerComponent, ViewButtonComponent, ViewModalComponent],
  templateUrl: './glossary-list.html',
  styleUrl: './glossary-list.css',
})
export class GlossaryListComponent implements OnInit {
  protected readonly glossariesService = inject(GlossariesService);
  protected readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  /** The glossary open in the read-only view modal (any user can open it). */
  protected readonly viewed = signal<Glossary | null>(null);

  protected instructionEntries(glossary: Glossary): { key: string; value: string }[] {
    return Object.entries(glossary.allGlossRules.instructions ?? {}).map(([key, value]) => ({ key, value }));
  }

  ngOnInit(): void {
    this.glossariesService.loadGlossaries();
  }

  protected deleteGlossary(glossary: Glossary): void {
    if (!this.authService.isAdmin()) {
      return;
    }

    const message = this.translate.instant('glossary.deleteConfirm', { name: glossary.glossaryName });
    if (!confirm(message)) {
      return;
    }

    this.glossariesService.deleteGlossary(glossary.id, {
      onSuccess: () => {
        this.toast.success(this.translate.instant('glossary.toast.deleted'));
      },
      onError: () => {
        this.toast.error(this.translate.instant('toast.genericError'));
      },
    });
  }
}
