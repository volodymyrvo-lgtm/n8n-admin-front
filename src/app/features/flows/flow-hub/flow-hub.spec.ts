import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { areasOf, AccessArea } from '../../../core/access';
import { AuthService, CurrentUser } from '../../../core/services/auth.service';
import { FlowHubComponent } from './flow-hub';

function configure(user: CurrentUser | null, authServiceStub: { logout: ReturnType<typeof vi.fn> }): void {
  TestBed.configureTestingModule({
    imports: [FlowHubComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          ...authServiceStub,
          currentUser: () => user,
          canAccess: (area: AccessArea) => areasOf(user?.role).includes(area),
        },
      },
    ],
  });
}

describe('FlowHubComponent', () => {
  let authServiceStub: { logout: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { logout: vi.fn() };
  });

  it('should create', async () => {
    configure({ id: 'u-1', username: 'volodymyr.vo@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('builds a two-letter avatar initial from a dotted email local part', async () => {
    configure({ id: 'u-1', username: 'volodymyr.vo@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    expect(fixture.componentInstance['userInitials']()).toBe('VV');
  });

  it('falls back to the first two characters of the local part when there is no dot', async () => {
    configure({ id: 'u-1', username: 'admin@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    expect(fixture.componentInstance['userInitials']()).toBe('AD');
  });

  it('falls back to "?" when there is no logged-in user', async () => {
    configure(null, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    expect(fixture.componentInstance['userInitials']()).toBe('?');
  });

  it('links the content, design, SEO, dashboard and error logs cards to /jobs, /design, /seo, /usage and /job-errors, and renders the other two flows as disabled buttons', async () => {
    configure({ id: 'u-1', username: 'volodymyr.vo@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const activeLinks = Array.from(el.querySelectorAll('.flow-card--active'));
    expect(activeLinks.map((link) => link.tagName)).toEqual(['A', 'A', 'A', 'A', 'A']);
    expect(activeLinks.map((link) => link.getAttribute('href'))).toEqual(['/jobs', '/design', '/seo', '/usage', '/job-errors']);

    const soonButtons = el.querySelectorAll('.flow-card--soon');
    expect(soonButtons.length).toBe(2);
    soonButtons.forEach((button) => {
      expect(button.tagName).toBe('BUTTON');
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('logs out and navigates to /login', async () => {
    configure({ id: 'u-1', username: 'volodymyr.vo@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance.logout();

    expect(authServiceStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  describe('by role', () => {
    async function render(role: CurrentUser['role']) {
      configure({ id: 'u-1', username: 'someone@royale.team', role }, authServiceStub);
      await TestBed.compileComponents();
      const fixture = TestBed.createComponent(FlowHubComponent);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    const hrefs = (el: HTMLElement) => Array.from(el.querySelectorAll('a.flow-card')).map((a) => a.getAttribute('href'));

    it('a reader gets the Content and SEO tiles pointing straight at the documents, the Design tile (banners) and the Error Logs tile', async () => {
      const el = await render('reader');
      expect(hrefs(el)).toEqual(['/rule-sets', '/design', '/seo/rule-sets', '/job-errors']);
      expect(el.querySelectorAll('button.flow-card--soon').length).toBe(0);
    });

    it('an analyst only gets the Dashboard tile', async () => {
      const el = await render('analyst');
      expect(hrefs(el)).toEqual(['/usage']);
      expect(el.querySelectorAll('button.flow-card--soon').length).toBe(0);
    });
  });
});
