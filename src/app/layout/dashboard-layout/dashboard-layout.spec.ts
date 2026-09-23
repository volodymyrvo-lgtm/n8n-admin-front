import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { DashboardLayoutComponent } from './dashboard-layout';

describe('DashboardLayoutComponent', () => {
  let authServiceStub: { logout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authServiceStub = { logout: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('logs out and navigates to /login', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance.logout();

    expect(authServiceStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('links back to the flow hub', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();

    const backLink = fixture.nativeElement.querySelector('.back-to-hub');
    expect(backLink?.getAttribute('href')).toBe('/flows');
  });
});
