import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../../core/services/auth.service';
import { Glossary, GlossaryEntry } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';
import { GlossaryEntriesListComponent } from './glossary-entries-list';
import { environment } from '@env';

const ADMIN_USER: CurrentUser = { id: '1', username: 'admin@royale.az', role: 'admin' };
const NON_ADMIN_USER: CurrentUser = { id: '2', username: 'user@royale.az', role: 'user' };

function makeGlossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    id: 'g-1',
    glossaryName: 'en_az_glossary',
    setType: ['localization', 'glossary', 'en_az'],
    allGlossRules: {
      entries: [],
      purpose: 'Standardize EN -> AZ terminology.',
      instructions: {},
      language_pair: 'en_az',
      schema_version: '1.0',
      source_language: 'EN',
      target_language: 'AZ',
    },
    createdAt: '2026-08-13T14:44:50.619Z',
    updatedAt: '2026-08-13T14:44:50.619Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: 'e-1',
    status: 'standardized',
    usage_note: null,
    english_term: 'Deposit',
    source_forms_found: ['depozit'],
    do_not_use_azerbaijani: ['əmanət'],
    recommended_azerbaijani: ['depozit'],
    ...overrides,
  };
}

function configure(): void {
  TestBed.configureTestingModule({
    imports: [GlossaryEntriesListComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'g-1' }) } } },
    ],
  });
}

describe('GlossaryEntriesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure();
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).currentUser.set(ADMIN_USER);
  });

  afterEach(() => httpMock.verify());

  it('shows the empty state when the glossary has no entries', () => {
    const fixture = TestBed.createComponent(GlossaryEntriesListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`).flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-state')).toBeTruthy();
    expect(el.textContent).toContain('en_az_glossary');
  });

  it('shows a table row reading the target-language-specific recommended field', () => {
    const fixture = TestBed.createComponent(GlossaryEntriesListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`).flush([makeEntry()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.textContent).toContain('Deposit');
    expect(el.textContent).toContain('depozit');

    const editLink = el.querySelector('a.icon-btn') as HTMLAnchorElement;
    expect(editLink.getAttribute('href')).toBe('/glossary/g-1/entries/e-1/edit');
  });

  it('deletes an entry after confirmation and shows a success toast', () => {
    const fixture = TestBed.createComponent(GlossaryEntriesListComponent);
    const glossariesService = TestBed.inject(GlossariesService);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`).flush([makeEntry()]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries/e-1`).flush({});

    expect(glossariesService.entries().length).toBe(0);
    expect(toastService.toasts()[0]?.type).toBe('success');
  });

  it('shows a dedicated message when the backend refuses to delete the last entry', () => {
    const fixture = TestBed.createComponent(GlossaryEntriesListComponent);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`).flush([makeEntry()]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries/e-1`)
      .flush({ message: 'Cannot delete the last entry' }, { status: 400, statusText: 'Bad Request' });

    // provideTranslateService() in tests has no translations loaded, so
    // translate.instant() just echoes the key back - assert on the key
    // itself (distinct from the generic 'toast.genericError' key) to
    // confirm the dedicated last-entry message path was taken.
    const toast = toastService.toasts()[0];
    expect(toast?.type).toBe('error');
    expect(toast?.message).toBe('glossary.entry.lastEntryError');
  });

  it('hides the "new term" button and the edit/delete actions for a non-admin user', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(GlossaryEntriesListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`).flush([makeEntry()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/glossary/g-1/entries/new"]')).toBeNull();
    expect(el.querySelector('a.icon-btn')).toBeNull();
    expect(el.querySelector('button.icon-btn--danger')).toBeNull();
  });
});
