import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RuleSet, SET_TYPES, SetType } from '../../core/models/rule-set.model';
import { AuthService } from '../../core/services/auth.service';
import { RuleSetsService } from '../../core/services/rule-sets.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

/** Rows per page for the client-side pager below - rule sets are hand-curated configuration data, not an ever-growing log, so a full fetch plus frontend paging (rather than backend page/limit params) is enough here. See JobListComponent for the contrasting case. */
const PAGE_SIZE = 20;

@Component({
  selector: 'app-rule-sets',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './rule-sets.html',
  styleUrl: './rule-sets.css',
})
export class RuleSetsComponent implements OnInit {
  protected readonly ruleSetsService = inject(RuleSetsService);
  protected readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  protected readonly setTypes = SET_TYPES;
  protected readonly selectedTypes = signal<SetType[]>([]);

  protected readonly filteredRuleSets = computed(() => {
    const selected = this.selectedTypes();
    const ruleSets = this.ruleSetsService.ruleSets();
    if (selected.length === 0) {
      return ruleSets;
    }
    return ruleSets.filter((ruleSet) => ruleSet.setType?.some((type) => selected.includes(type)));
  });

  protected readonly page = signal(1);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRuleSets().length / PAGE_SIZE)),
  );

  /** The current page's slice of `filteredRuleSets()` - what the table actually renders. */
  protected readonly pagedRuleSets = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRuleSets().slice(start, start + PAGE_SIZE);
  });

  ngOnInit(): void {
    this.ruleSetsService.loadRuleSets();
  }

  protected fieldCount(ruleSet: RuleSet): number {
    return Object.keys(ruleSet.ruleSet ?? {}).length;
  }

  protected toggleTypeFilter(type: SetType): void {
    this.selectedTypes.update((current) =>
      current.includes(type) ? current.filter((selected) => selected !== type) : [...current, type],
    );
    this.page.set(1);
  }

  protected clearTypeFilter(): void {
    this.selectedTypes.set([]);
    this.page.set(1);
  }

  protected deleteRuleSet(ruleSet: RuleSet): void {
    if (!this.authService.isAdmin()) {
      return;
    }

    const message = this.translate.instant('ruleSets.deleteConfirm', { name: ruleSet.ruleName });
    if (confirm(message)) {
      this.ruleSetsService.deleteRuleSet(ruleSet.id!, () => {
        this.toast.success(this.translate.instant('ruleSets.toast.deleted'));
      });
    }
  }
}
