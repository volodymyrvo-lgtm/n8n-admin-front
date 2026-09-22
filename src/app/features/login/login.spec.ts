import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { LoginComponent } from './login';

describe('LoginComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('starts with an invalid, untouched form', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance as unknown as { form: { invalid: boolean } };
    expect(component.form.invalid).toBe(true);
  });

  it('toggles password visibility', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance as unknown as {
      isPasswordVisible: () => boolean;
      togglePasswordVisibility: () => void;
    };
    expect(component.isPasswordVisible()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.isPasswordVisible()).toBe(true);
  });
});
