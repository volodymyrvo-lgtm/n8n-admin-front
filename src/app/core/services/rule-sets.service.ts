import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { CreateRuleSetInput, RuleSet, RuleSetKind } from '../models/rule-set.model';
import { HttpClient, HttpParams } from '@angular/common/http';
import { finalize } from 'rxjs';
import { environment } from '@env';

const RULES_URL = `${environment.apiBaseUrl}/rules`;
const SEO_RULES_URL = `${RULES_URL}/seo`;

/**
 * Rule set store backed by the backend (`/rules`).
 *
 * Rules come in two kinds (see RuleSetKind): `communication` (CRM
 * mailings, `ruleSets`) and `seo` (SEO generation, `seoRuleSets`). The
 * communication list is fetched with a plain `GET /rules`, exactly as
 * before the kinds existed; the SEO one with `GET /rules?kind=seo`. They
 * live in separate signals so one section never shows the other's rules.
 *
 * A rule's kind is decided by the route it is created through
 * (`POST /rules` vs `POST /rules/seo`) - the body never carries a `kind`,
 * and it can't be changed afterwards.
 */
@Injectable({ providedIn: 'root' })
export class RuleSetsService {
  private http = inject(HttpClient);
  /** Communication rule sets (the default kind). */
  readonly ruleSets = signal<RuleSet[]>([]);
  /** SEO rule sets. */
  readonly seoRuleSets = signal<RuleSet[]>([]);
  readonly loading = signal<boolean>(false);

  /** The list for a kind - lets a page that serves both sections pick its own. */
  ruleSetsFor(kind: RuleSetKind): WritableSignal<RuleSet[]> {
    return kind === 'seo' ? this.seoRuleSets : this.ruleSets;
  }

  loadRuleSets(kind: RuleSetKind = 'communication'): void {
    this.loading.set(true);
    // Communication rules keep the original, parameterless request.
    const request =
      kind === 'seo'
        ? this.http.get<RuleSet[]>(RULES_URL, { params: new HttpParams().set('kind', 'seo') })
        : this.http.get<RuleSet[]>(RULES_URL);

    request.pipe(finalize(() => this.loading.set(false))).subscribe((result) => {
      this.ruleSetsFor(kind).set(result);
    });
  }

  addRuleSet(input: CreateRuleSetInput, kind: RuleSetKind = 'communication'): RuleSet {
    const ruleSet: RuleSet = {
      ruleName: input.ruleName,
      ruleSet: input.ruleSet,
      setType: input.setType,
    };

    // The body is the same for both kinds, and has no `kind` (the backend rejects it): only the route differs.
    this.http.post(kind === 'seo' ? SEO_RULES_URL : RULES_URL, ruleSet).subscribe();

    this.ruleSetsFor(kind).update((ruleSets) => [...ruleSets, ruleSet]);
    return ruleSet;
  }

  /** `kind` only says which list to reload afterwards - `PATCH /rules/:id` is the same route for both kinds and can't change a rule's kind. */
  updateRuleSet(id: string, input: CreateRuleSetInput, kind: RuleSetKind = 'communication'): RuleSet | undefined {
    let updated: RuleSet | undefined;

    this.http
      .patch(`${RULES_URL}/${id}`, input)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe(() => {
        this.loadRuleSets(kind);
      });

    return updated;
  }

  // Ids are unique across kinds, so a delete just applies to both lists.
  deleteRuleSet(id: string, onSuccess?: () => void): void {
    this.http.delete(`${RULES_URL}/${id}`).subscribe(() => {
      const remove = (ruleSets: RuleSet[]) => ruleSets.filter((ruleSet) => ruleSet.id !== id);
      this.ruleSets.update(remove);
      this.seoRuleSets.update(remove);
      onSuccess?.();
    });
  }
}
