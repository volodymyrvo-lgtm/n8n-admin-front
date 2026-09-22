import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../../core/services/auth.service';
import { Glossary } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';
import { GlossaryListComponent } from './glossary-list';
import { environment } from '@env';

const ADMIN_USER: CurrentUser = { id: '1', username: 'admin@royale.az', role: 'admin' };
const NON_ADMIN_USER: CurrentUser = { id: '2', username: 'user@royale.az', role: 'user' };

function makeGlossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    id: 'g-1',
    glossaryName: 'en_az_glossary',
    setType: ['localization', 'glossary', 'en_az'],
    allGlossRules: {
      entries: [{ id: 'e-1', status: 'standardized', usage_note: null, english_term: 'Deposit', source_forms_found: [] }],
      purpose: 'Standardize EN -> AZ terminology.',
      instructions: { tone: 'formal' },
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

describe('GlossaryListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlossaryListComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Most tests below exercise the create/edit/delete actions, which are
    // only rendered for admins - default the stubbed session to admin here
    // and override to NON_ADMIN_USER in the non-admin test.
    TestBed.inject(AuthService).currentUser.set(ADMIN_USER);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows the empty state when there are no glossaries', () => {
    const fixture = TestBed.createComponent(GlossaryListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-state')).toBeTruthy();
    expect(el.querySelector('.data-table')).toBeNull();
  });

  it('shows a table row with a link into the glossary once glossaries exist', () => {
    const fixture = TestBed.createComponent(GlossaryListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.textContent).toContain('en_az_glossary');
    expect(el.textContent).toContain('en_az');

    const openLink = el.querySelector('a.data-table__cell-primary') as HTMLAnchorElement;
    expect(openLink.getAttribute('href')).toBe('/glossary/g-1');

    const editLink = el.querySelector('a.icon-btn') as HTMLAnchorElement;
    expect(editLink.getAttribute('href')).toBe('/glossary/g-1/edit');
  });

  it('deletes a glossary after confirmation and shows a success toast', () => {
    const fixture = TestBed.createComponent(GlossaryListComponent);
    const glossariesService = TestBed.inject(GlossariesService);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1`).flush({});

    expect(glossariesService.glossaries().length).toBe(0);
    expect(toastService.toasts()[0]?.type).toBe('success');
  });

  it('keeps the glossary when the user cancels the delete confirmation', () => {
    const fixture = TestBed.createComponent(GlossaryListComponent);
    const glossariesService = TestBed.inject(GlossariesService);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();

    expect(glossariesService.glossaries().length).toBe(1);
  });

  it('hides the "new glossary" button and the edit/delete actions for a non-admin user', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(GlossaryListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`).flush([makeGlossary()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('a[href="/glossary/new"]')).toBeNull();
    expect(el.querySelector('a.icon-btn')).toBeNull();
    expect(el.querySelector('button.icon-btn--danger')).toBeNull();
  });
});
