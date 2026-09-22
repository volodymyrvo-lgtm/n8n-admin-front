import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { ToastService } from '../../core/services/toast.service';
import { UsersComponent } from './users';

const ADMIN_USER: CurrentUser = { id: '1', username: 'admin@royale.az', role: 'admin' };
const NON_ADMIN_USER: CurrentUser = { id: '2', username: 'user@royale.az', role: 'user' };

describe('UsersComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Most tests below exercise the add/delete actions, which are only
    // rendered for admins - default the stubbed session to admin here and
    // override to NON_ADMIN_USER in the tests that specifically cover the
    // non-admin (hidden actions) case.
    TestBed.inject(AuthService).currentUser.set(ADMIN_USER);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows a spinner while the initial request is in flight, then the empty state once it resolves empty', () => {
    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-spinner')).toBeTruthy();
    expect(el.querySelector('app-empty-state')).toBeNull();

    httpMock.expectOne('http://localhost:3000/users').flush([]);
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-spinner')).toBeNull();
    expect(el.querySelector('app-empty-state')).toBeTruthy();
  });

  it('shows a table row per user once users exist', () => {
    const fixture = TestBed.createComponent(UsersComponent);
    const usersService = TestBed.inject(UsersService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/users').flush([]);

    usersService.users.set([{ id: '1', username: 'ada.lovelace', role: 'admin' }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('app-empty-state')).toBeNull();
  });

  it('deletes the user when the user confirms the prompt', () => {
    const fixture = TestBed.createComponent(UsersComponent);
    const usersService = TestBed.inject(UsersService);
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/users').flush([]);

    usersService.users.set([{ id: '1', username: 'ada.lovelace', role: 'admin' }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();
    httpMock.expectOne('http://localhost:3000/users/1').flush({});

    expect(usersService.users().length).toBe(0);
    expect(toastService.toasts()[0]?.type).toBe('success');
  });

  it('keeps the user when the user cancels the prompt', () => {
    const fixture = TestBed.createComponent(UsersComponent);
    const usersService = TestBed.inject(UsersService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/users').flush([]);

    usersService.users.set([{ id: '1', username: 'ada.lovelace', role: 'admin' }]);
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const deleteButton = fixture.nativeElement.querySelector('button.icon-btn--danger') as HTMLButtonElement;
    deleteButton.click();

    expect(usersService.users().length).toBe(1);
  });

  it('hides the add and delete actions for a non-admin user', () => {
    TestBed.inject(AuthService).currentUser.set(NON_ADMIN_USER);

    const fixture = TestBed.createComponent(UsersComponent);
    const usersService = TestBed.inject(UsersService);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/users').flush([]);

    usersService.users.set([{ id: '1', username: 'ada.lovelace', role: 'admin' }]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data-table__row').length).toBe(1);
    expect(el.querySelector('a[href="/users/new"]')).toBeNull();
    expect(el.querySelector('button.icon-btn--danger')).toBeNull();
  });
});
