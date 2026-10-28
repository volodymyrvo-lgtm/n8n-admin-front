import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { areasOf, AccessArea } from '../../core/access';
import { AuthService } from '../../core/services/auth.service';
import { DashboardLayoutComponent } from './dashboard-layout';

describe('DashboardLayoutComponent', () => {
  let authServiceStub: { logout: ReturnType<typeof vi.fn>; canAccess: (area: AccessArea) => boolean };

  beforeEach(async () => {
    authServiceStub = { logout: vi.fn(), canAccess: () => true };

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
    expect(hrefs).toContain('/email');
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

  describe('in the Design section', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DashboardLayoutComponent],
        providers: [
          provideTranslateService(),
          provideRouter([]),
          { provide: AuthService, useValue: authServiceStub },
          { provide: ActivatedRoute, useValue: { snapshot: { data: { section: 'design' } } } },
        ],
      });
    });

    it('shows only the design menu: all jobs, add job and banners', () => {
      const fixture = TestBed.createComponent(DashboardLayoutComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      const hrefs = Array.from(el.querySelectorAll('.nav-item')).map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['/design/jobs', '/design/jobs/new', '/design/banners']);
      expect(el.querySelector('.sidebar__section')).not.toBeNull();
    });
  });

  function menuHrefs(role: string, seo: boolean): (string | null)[] {
    authServiceStub.canAccess = (area) => areasOf(role).includes(area);
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { data: seo ? { section: 'seo' } : {} } } });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.sidebar__nav a')).map((a) => a.getAttribute('href'));
  }

  it('a reader only sees the document links in the Content menu', () => {
    expect(menuHrefs('reader', false)).toEqual(['/rule-sets', '/prompts', '/glossary']);
  });

  it('a reader only sees the banners in the Design menu', () => {
    authServiceStub.canAccess = (area) => areasOf('reader').includes(area);
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { data: { section: 'design' } } } });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.sidebar__nav a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/design/banners']);
  });

  it('a reader only sees the document links in the SEO menu', () => {
    expect(menuHrefs('reader', true)).toEqual(['/seo/rule-sets', '/seo/prompts']);
  });

  it('an analyst sees no section links', () => {
    expect(menuHrefs('analyst', false)).toEqual([]);
  });
});
