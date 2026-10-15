import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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

  it('shows the communication menu by default', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();

    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('.nav-item')).map((a) => (a as HTMLElement).getAttribute('href'));
    expect(hrefs).toContain('/jobs');
    expect(hrefs).not.toContain('/seo/jobs');
    expect(fixture.nativeElement.querySelector('.sidebar__section')).toBeNull();
  });

  describe('in the SEO section', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DashboardLayoutComponent],
        providers: [
          provideTranslateService(),
          provideRouter([]),
          { provide: AuthService, useValue: authServiceStub },
          { provide: ActivatedRoute, useValue: { snapshot: { data: { section: 'seo' } } } },
        ],
      });
    });

    it('shows only the SEO menu: all jobs, add job and prompts', () => {
      const fixture = TestBed.createComponent(DashboardLayoutComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      const hrefs = Array.from(el.querySelectorAll('.nav-item')).map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['/seo/jobs', '/seo/jobs/new', '/seo/rule-sets', '/seo/prompts']);
      expect(el.querySelector('.sidebar__section')).not.toBeNull();
    });
  });
});
