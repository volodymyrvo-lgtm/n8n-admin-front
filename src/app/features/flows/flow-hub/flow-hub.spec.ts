import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService, CurrentUser } from '../../../core/services/auth.service';
import { FlowHubComponent } from './flow-hub';

function configure(user: CurrentUser | null, authServiceStub: { logout: ReturnType<typeof vi.fn> }): void {
  TestBed.configureTestingModule({
    imports: [FlowHubComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      { provide: AuthService, useValue: { ...authServiceStub, currentUser: () => user } },
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

  it('links the content generation card to /jobs, and renders the other four flows as disabled buttons', async () => {
    configure({ id: 'u-1', username: 'volodymyr.vo@royale.team', role: 'admin' }, authServiceStub);
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(FlowHubComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const contentLink = el.querySelector('.flow-card--active');
    expect(contentLink?.tagName).toBe('A');
    expect(contentLink?.getAttribute('href')).toBe('/jobs');

    const soonButtons = el.querySelectorAll('.flow-card--soon');
    expect(soonButtons.length).toBe(4);
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
});
