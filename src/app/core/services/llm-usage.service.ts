import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@env';
import { Observable } from 'rxjs';
import {
  LlmUsageFilters,
  LlmUsageFiltersResponse,
  LlmUsageListQuery,
  LlmUsageSummaryQuery,
  LlmUsageSummaryRow,
  PaginatedLlmUsage,
} from '../models/llm-usage.model';

const LLM_USAGE_URL = `${environment.apiBaseUrl}/llm-usage`;

/**
 * Adds one query param per value for a list filter (`type=a&type=b`)
 * instead of a comma-joined `type=a,b`: flow names are free-form
 * (`NEWCRM_PPL_AZ/RU_...`), so a comma in one would silently split it
 * into two values. The backend accepts both forms.
 */
function appendList(params: HttpParams, key: string, values: readonly string[] | undefined): HttpParams {
  for (const value of values ?? []) {
    params = params.append(key, value);
  }
  return params;
}

function filterParams(params: HttpParams, filters: LlmUsageFilters): HttpParams {
  if (filters.date) {
    params = params.set('date', filters.date);
  }
  if (filters.from) {
    params = params.set('from', filters.from);
  }
  if (filters.to) {
    params = params.set('to', filters.to);
  }
  params = appendList(params, 'type', filters.type);
  params = appendList(params, 'flow', filters.flow);
  params = appendList(params, 'llmMod', filters.llmMod);
  return params;
}

/**
 * Stateless client for the LLM-spend dashboard endpoints. Every method
 * returns the raw Observable (no signals/caching here) so the dashboard
 * can `unsubscribe` a stale request when its filters change - HttpClient
 * aborts the underlying request on unsubscribe, which is how "don't
 * render an outdated response" is guaranteed.
 */
@Injectable({ providedIn: 'root' })
export class LlmUsageService {
  private readonly http = inject(HttpClient);

  getFilters(): Observable<LlmUsageFiltersResponse> {
    return this.http.get<LlmUsageFiltersResponse>(`${LLM_USAGE_URL}/filters`);
  }

  getSummary(query: LlmUsageSummaryQuery): Observable<LlmUsageSummaryRow[]> {
    let params = filterParams(new HttpParams(), query);
    if (query.granularity) {
      params = params.set('granularity', query.granularity);
    }
    params = appendList(params, 'groupBy', query.groupBy);
    return this.http.get<LlmUsageSummaryRow[]>(`${LLM_USAGE_URL}/summary`, { params });
  }

  getList(query: LlmUsageListQuery): Observable<PaginatedLlmUsage> {
    let params = filterParams(new HttpParams(), query);
    if (query.page) {
      params = params.set('page', query.page);
    }
    if (query.limit) {
      params = params.set('limit', query.limit);
    }
    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy);
    }
    if (query.order) {
      params = params.set('order', query.order);
    }
    return this.http.get<PaginatedLlmUsage>(LLM_USAGE_URL, { params });
  }
}
