import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { UsersService } from '../../../core/services/users.service';
import { AddUserComponent } from './add-user';

describe('AddUserComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddUserComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('offers all four roles', () => {
    const fixture = TestBed.createComponent(AddUserComponent);
    fixture.detectChanges();

    const values = Array.from(fixture.nativeElement.querySelectorAll('#userRole option')).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['admin', 'user', 'reader', 'analyst']);
  });

  it('hides the password by default and lets the admin reveal and hide it again', () => {
    const fixture = TestBed.createComponent(AddUserComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = () => el.querySelector('#userPassword') as HTMLInputElement;
    const toggle = el.querySelector('[data-testid="toggle-password"]') as HTMLButtonElement;

    expect(input().type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(input().type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fixture.componentInstance['form'].controls.password.setValue('secret123');
    fixture.detectChanges();
    expect(input().value).toBe('secret123');

    toggle.click();
    fixture.detectChanges();
    expect(input().type).toBe('password');
  });

  it('does not submit while the form is invalid', () => {
    const fixture = TestBed.createComponent(AddUserComponent);
    const usersService = TestBed.inject(UsersService);
    fixture.componentInstance.submit();

    expect(usersService.users().length).toBe(0);
  });

  it('creates a user with the given username and role, without storing the password', () => {
    const fixture = TestBed.createComponent(AddUserComponent);
    const usersService = TestBed.inject(UsersService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance['form'].setValue({
      username: 'ada.lovelace',
      role: 'user',
      password: 'secret123',
    });
    fixture.componentInstance.submit();

    httpMock
      .expectOne('http://localhost:3000/users')
      .flush({ id: '1', username: 'ada.lovelace', role: 'user' });

    expect(usersService.users().length).toBe(1);
    const saved = usersService.users()[0];
    expect(saved.username).toBe('ada.lovelace');
    expect(saved.role).toBe('user');
    expect(saved).not.toHaveProperty('password');
    expect(navigateSpy).toHaveBeenCalledWith('/users');
  });

  it('marks the password as invalid when it is too short', () => {
    const fixture = TestBed.createComponent(AddUserComponent);
    fixture.componentInstance['form'].setValue({
      username: 'ada.lovelace',
      role: 'user',
      password: '123',
    });

    expect(fixture.componentInstance['form'].controls.password.invalid).toBe(true);
  });
});
