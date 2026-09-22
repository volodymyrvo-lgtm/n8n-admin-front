import { inject, Injectable, signal } from '@angular/core';
import { CreateRuleSetInput, RuleSet } from '../models/rule-set.model';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { environment } from '@env';

const RULES_URL = `${environment.apiBaseUrl}/rules`;

/**
 * In-memory rule set store.
 *
 * TODO: this starts empty and `addRuleSet`/`updateRuleSet`/`deleteRuleSet`
 * only mutate local state - wire them up to the real backend once the
 * API exists.
 */
@Injectable({ providedIn: 'root' })
export class RuleSetsService {
  private http = inject(HttpClient);
  readonly ruleSets = signal<RuleSet[]>([]);
  readonly loading = signal<boolean>(false);

  loadRuleSets(): void {
    this.loading.set(true);
    this.http
      .get(RULES_URL)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result: any) => {
        this.ruleSets.set(result);
      });
  }

  addRuleSet(input: CreateRuleSetInput): RuleSet {
    const ruleSet: RuleSet = {
      ruleName: input.ruleName,
      ruleSet: input.ruleSet,
      setType: input.setType,
    };

    this.http.post(RULES_URL, ruleSet).subscribe((result: any) => {

    })

    this.ruleSets.update((ruleSets) => [...ruleSets, ruleSet]);
    return ruleSet;
  }

  updateRuleSet(id: string, input: CreateRuleSetInput): RuleSet | undefined {
    let updated: RuleSet | undefined;

    this.http.patch(`${RULES_URL}/${id}`, input).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe(() => {
      this.loadRuleSets();
    })

    // this.ruleSets.update((ruleSets) =>
    //   ruleSets.map((ruleSet) => {
    //     if (ruleSet.id !== id) {
    //       return ruleSet;
    //     }
    //     updated = { id, ruleName: input.ruleName, ruleSet: input.ruleSet, setType: input.setType };
    //     return updated;
    //   }),
    // );

    return updated;
  }

  deleteRuleSet(id: string, onSuccess?: () => void): void {
    this.http.delete(`${RULES_URL}/${id}`).subscribe((result: any) => {
      this.ruleSets.update((ruleSets) => ruleSets.filter((ruleSet) => ruleSet.id !== id));
      onSuccess?.();
    })
  }
}
