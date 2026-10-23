import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { areaGuard } from './area.guard';

describe('areaGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  function run(role: 'admin' | 'user' | 'reader' | 'analyst', ...areas: Parameters<typeof areaGuard>) {
    TestBed.inject(AuthService).currentUser.set({ id: '1', username: 'x@royale.az', role });
    const result = TestBed.runInInjectionContext(() => areaGuard(...areas)({} as never, {} as never));
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  it('lets a role through when it can open the area', () => {
    expect(run('user', 'jobs')).toBe(true);
    expect(run('reader', 'documents')).toBe(true);
    expect(run('analyst', 'dashboard')).toBe(true);
  });

  it('lets a role through when it can open any one of several areas', () => {
    expect(run('reader', 'jobs', 'documents')).toBe(true);
  });

  it('lets a reader open the banners and sends an analyst away from them', () => {
    expect(run('reader', 'banners')).toBe(true);
    expect(run('analyst', 'banners')).toBe('/usage');
  });

  it('sends a reader away from the dashboard and the jobs to the documents', () => {
    expect(run('reader', 'dashboard')).toBe('/rule-sets');
  });

  it('sends an analyst away from everything but the dashboard back to it', () => {
    expect(run('analyst', 'jobs')).toBe('/usage');
    expect(run('analyst', 'documents')).toBe('/usage');
    expect(run('analyst', 'users')).toBe('/usage');
  });
});
