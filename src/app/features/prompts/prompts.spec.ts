import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../core/services/auth.service';
import { PromptsService } from '../../core/services/prompts.service';
import { ToastService } from '../../core/services/toast.service';
import { PromptsComponent } from './prompts';

const ADMIN_USER: CurrentUser = { id: '1', username: 'admin@royale.az', role: 'admin' };
const NON_ADMIN_USER: CurrentUser = { id: '2', username: 'user@royale.az', role: 'user' };

describe('PromptsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptsComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Most tests below exercise the create/edit/delete actions, which are
    // only rendered for admins - default the stubbed session to admin here
    // and override to NON_ADMIN_USER in the test that covers the
    // non-admin (hidden actions) case.
    TestBed.inject(AuthService).currentUser.set(ADMIN_USER);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows the empty state when there are no prompts', () => {
    const fixture = TestBed.createComponent(PromptsComponent);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/prompts').flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-state')).toBeTruthy();
    expect(el.querySelector('.data-table')).toBeNull();
  });

  it('shows a table row with an edit link per prompt once prompts exist', () => {
    const fixture = TestBed.createComponent(PromptsComponent);
    fixture.detectChanges();
    httpMock
      .expectOne('http://localhost:3000/prompts')
      .flush([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('app-empty-state')).toBeNull();
    expect(el.textContent).toContain('Welcome message');

    const editLink = el.querySelector('a.icon-btn') as HTMLAnchorElement;
    expect(editLink.getAttribute('href')).toBe('/prompts/p-1/edit');
  });

  it('deletes a prompt after confirmation and shows a success toast', () => {
    const fixture = TestBed.createComponent(PromptsComponent);
    const promptsService = TestBed.inject(PromptsService);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock
      .expectOne('http://localhost:3000/prompts')
      .flush([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock.expectOne('http://localhost:3000/prompts/p-1').flush({});

    expect(promptsService.prompts().length).toBe(0);
    expect(toastService.toasts()[0]?.type).toBe('success');
  });

  it('keeps the prompt when the user cancels the delete confirmation', () => {
    const fixture = TestBed.createComponent(PromptsComponent);
    const promptsService = TestBed.inject(PromptsService);
    fixture.detectChanges();
    httpMock
      .expectOne('http://localhost:3000/prompts')
      .flush([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();

    expect(promptsService.prompts().length).toBe(1);
  });

  it('hides the "new prompt" button and the edit/delete actions for a non-admin user', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(PromptsComponent);
    fixture.detectChanges();
    httpMock
      .expectOne('http://localhost:3000/prompts')
      .flush([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('a[href="/prompts/new"]')).toBeNull();
    expect(el.querySelector('a.icon-btn')).toBeNull();
    expect(el.querySelector('button.icon-btn--danger')).toBeNull();
  });

  it('does not delete a prompt when a non-admin somehow triggers the handler directly', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(PromptsComponent);
    const promptsService = TestBed.inject(PromptsService);
    fixture.detectChanges();
    httpMock
      .expectOne('http://localhost:3000/prompts')
      .flush([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);
    fixture.detectChanges();

    // window.confirm may already be a spy left over from an earlier test
    // in this file (it's never restored) - clear its call history first so
    // this assertion only reflects what deletePrompt does here.
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockClear();
    (fixture.componentInstance as any).deletePrompt(promptsService.prompts()[0]);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(promptsService.prompts().length).toBe(1);
  });
});
