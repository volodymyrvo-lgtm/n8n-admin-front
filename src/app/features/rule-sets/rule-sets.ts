import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RuleSet, SET_TYPES, SetType } from '../../core/models/rule-set.model';
import { AuthService } from '../../core/services/auth.service';
import { RuleSetsService } from '../../core/services/rule-sets.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

@Component({
  selector: 'app-rule-sets',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent],
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
  }

  protected clearTypeFilter(): void {
    this.selectedTypes.set([]);
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
