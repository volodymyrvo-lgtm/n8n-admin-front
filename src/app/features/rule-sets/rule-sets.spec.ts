import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../core/services/auth.service';
import { RuleSetsService } from '../../core/services/rule-sets.service';
import { ToastService } from '../../core/services/toast.service';
import { RuleSetsComponent } from './rule-sets';

const ADMIN_USER: CurrentUser = { id: '1', username: 'admin@royale.az', role: 'admin' };
const NON_ADMIN_USER: CurrentUser = { id: '2', username: 'user@royale.az', role: 'user' };

describe('RuleSetsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuleSetsComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Most tests below exercise the edit/delete actions, which are only
    // rendered for admins - default the stubbed session to admin here and
    // override to NON_ADMIN_USER in the tests that specifically cover the
    // non-admin (hidden actions) case.
    TestBed.inject(AuthService).currentUser.set(ADMIN_USER);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows a spinner while the initial request is in flight, then the empty state once it resolves empty', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-spinner')).toBeTruthy();
    expect(el.querySelector('app-empty-state')).toBeNull();

    httpMock.expectOne('http://localhost:3000/rules').flush([]);
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-spinner')).toBeNull();
    expect(el.querySelector('app-empty-state')).toBeTruthy();
  });

  it('shows a table row with the field count and edit/delete actions per rule set', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([
      { id: '1', ruleName: 'Default routing', ruleSet: { Segment: 'Deposit Count = 0' }, setType: ['email'] },
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('app-empty-state')).toBeNull();
    expect(el.textContent).toContain('1');

    const editLink = el.querySelector('a.icon-btn') as HTMLAnchorElement;
    expect(editLink.getAttribute('href')).toBe('/rule-sets/1/edit');

    const links = el.querySelectorAll('a.icon-btn');
    const duplicateLink = links[1] as HTMLAnchorElement;
    expect(duplicateLink.getAttribute('href')).toBe('/rule-sets/new?duplicateFrom=1');
  });

  it('deletes the rule set when the user confirms the prompt', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([{ id: '1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock.expectOne('http://localhost:3000/rules/1').flush({});

    expect(ruleSetsService.ruleSets().length).toBe(0);
    expect(toastService.toasts()[0]?.type).toBe('success');
  });

  it('keeps the rule set when the user cancels the prompt', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([{ id: '1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();

    expect(ruleSetsService.ruleSets().length).toBe(1);
  });

  it('filters the list by the selected type chips and can be cleared again', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([
      { id: '1', ruleName: 'Email routing', ruleSet: {}, setType: ['email'] },
      { id: '2', ruleName: 'SMS routing', ruleSet: {}, setType: ['sms'] },
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(2);

    const smsChip = el.querySelector('.type-filter__chip[data-type="sms"]') as HTMLButtonElement;
    smsChip.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.textContent).toContain('SMS routing');
    expect(el.textContent).not.toContain('Email routing');
    expect(smsChip.classList).toContain('type-filter__chip--active');

    const clearButton = el.querySelector('.type-filter__clear') as HTMLButtonElement;
    clearButton.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.data-table__row').length).toBe(2);
    expect(el.querySelector('.type-filter__clear')).toBeNull();
  });

  it('shows the "no matches" empty state when the filter excludes every rule set', () => {
    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([{ id: '1', ruleName: 'Email routing', ruleSet: {}, setType: ['email'] }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const smsChip = el.querySelector('.type-filter__chip[data-type="sms"]') as HTMLButtonElement;
    smsChip.click();
    fixture.detectChanges();

    expect(el.querySelector('.data-table')).toBeNull();
    expect(el.querySelector('app-empty-state')).toBeTruthy();
  });

  it('hides the edit and delete actions for a non-admin user', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(RuleSetsComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([]);

    ruleSetsService.ruleSets.set([{ id: '1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('a.icon-btn')).toBeNull();
    expect(el.querySelector('button.icon-btn--danger')).toBeNull();
    expect(el.querySelector('a[href="/rule-sets/new"]')).toBeNull();
  });
});
