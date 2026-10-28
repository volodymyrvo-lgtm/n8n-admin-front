import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CustomerFolder } from '../../../../core/models/customer-folder.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { BannerFoldersComponent } from './banner-folders';

const API = 'http://localhost:3000/customer-folders';

function folder(id: number, name: string, parentId: number | null = null): CustomerFolder {
  return { id, name, parentId, createdAt: '2026-10-23T11:01:16.934Z', updatedAt: '2026-10-23T11:01:16.934Z' };
}

const LIST = [folder(1, 'Campaigns'), folder(2, 'Archive'), folder(3, 'Summer', 1), folder(4, 'Az', 3)];

@Component({
  imports: [BannerFoldersComponent],
  template: `<app-banner-folders [selectedId]="selected()" (selectedChange)="changes.push($event); selected.set($event)" />`,
})
class HostComponent {
  readonly selected = signal<number | null>(null);
  readonly changes: (number | null)[] = [];
}

describe('BannerFoldersComponent', () => {
  let httpMock: HttpTestingController;

  async function setup(role: 'admin' | 'user' | 'reader' = 'user', selected: number | null = null) {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).currentUser.set({ id: '1', username: 'x@royale.az', role });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.selected.set(selected);
    fixture.detectChanges();
    return fixture;
  }

  async function loaded(role: 'admin' | 'user' | 'reader' = 'user', selected: number | null = null, items = LIST) {
    const fixture = await setup(role, selected);
    httpMock.expectOne(API).flush({ items, total: items.length });
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement;
  const rowNames = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(el(fixture).querySelectorAll('[data-testid="folder-row"] .folders__name')).map((node) => node.textContent?.trim());
  const query = <T extends HTMLElement>(fixture: { nativeElement: HTMLElement }, id: string) =>
    el(fixture).querySelector<T>(`[data-testid="${id}"]`);

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => httpMock.verify());

  it('shows a spinner while loading', async () => {
    const fixture = await setup();

    expect(el(fixture).querySelector('app-spinner')).not.toBeNull();
    httpMock.expectOne(API).flush({ items: [], total: 0 });
  });

  it('shows the top-level folders sorted, with nested ones hidden until expanded', async () => {
    const fixture = await loaded();

    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns']);
    const rows = el(fixture).querySelectorAll('[data-testid="folder-row"]');
    expect(rows[0].getAttribute('aria-expanded')).toBeNull();
    expect(rows[1].getAttribute('aria-expanded')).toBe('false');
    expect(rows[1].getAttribute('aria-level')).toBe('1');
  });

  it('expands and collapses a folder, keeping the nesting indent', async () => {
    const fixture = await loaded();

    el(fixture).querySelectorAll<HTMLButtonElement>('[data-testid="folder-toggle"]')[0].click();
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns', 'Summer']);
    const rows = el(fixture).querySelectorAll<HTMLElement>('[data-testid="folder-row"]');
    expect(rows[2].getAttribute('aria-level')).toBe('2');
    expect(rows[2].style.paddingLeft).toBe('16px');

    el(fixture).querySelectorAll<HTMLButtonElement>('[data-testid="folder-toggle"]')[0].click();
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns']);
  });

  it('chooses a folder on click and clears the choice on a second click', async () => {
    const fixture = await loaded();
    const host = fixture.componentInstance;

    el(fixture).querySelectorAll<HTMLButtonElement>('[data-testid="folder-select"]')[0].click();
    fixture.detectChanges();
    expect(host.changes).toEqual([2]);
    expect(query(fixture, 'selected-folder')?.textContent).toContain('Archive');
    expect(el(fixture).querySelector('[aria-selected="true"]')).not.toBeNull();

    el(fixture).querySelectorAll<HTMLButtonElement>('[data-testid="folder-select"]')[0].click();
    fixture.detectChanges();
    expect(host.changes).toEqual([2, null]);
    expect(query(fixture, 'selected-folder')).toBeNull();
  });

  it('clears the choice with the Clear button', async () => {
    const fixture = await loaded('user', 2);

    query<HTMLButtonElement>(fixture, 'clear-folder')!.click();

    expect(fixture.componentInstance.changes).toEqual([null]);
  });

  it('opens every folder above a folder chosen from outside and shows its path', async () => {
    const fixture = await loaded('user', 4);

    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns', 'Summer', 'Az']);
    const crumbs = Array.from(el(fixture).querySelectorAll('[data-testid="folder-crumb"]')).map((node) => node.textContent);
    expect(crumbs).toEqual(['Campaigns', 'Summer', 'Az']);
  });

  it('ignores a chosen id that is not in the list', async () => {
    const fixture = await loaded('user', 404);

    expect(query(fixture, 'selected-folder')).toBeNull();
    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns']);
  });

  it('shows an empty message when there are no folders', async () => {
    const fixture = await loaded('user', null, []);

    expect(query(fixture, 'folders-empty')).not.toBeNull();
  });

  it('shows a failure with a retry that loads again', async () => {
    const fixture = await setup();
    httpMock.expectOne(API).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(query(fixture, 'folders-failed')).not.toBeNull();
    query<HTMLButtonElement>(fixture, 'folders-retry')!.click();
    httpMock.expectOne(API).flush({ items: LIST, total: 4 });
    fixture.detectChanges();

    expect(query(fixture, 'folders-failed')).toBeNull();
    expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns']);
  });

  describe('creating a folder', () => {
    it.each(['user', 'reader'] as const)('is not offered to a %s', async (role) => {
      const fixture = await loaded(role);

      expect(query(fixture, 'new-folder')).toBeNull();
      expect(query(fixture, 'folder-form')).toBeNull();
    });

    it('opens a form that defaults to the top level when nothing is chosen', async () => {
      const fixture = await loaded('admin');

      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      expect(query(fixture, 'folder-form')).not.toBeNull();
      expect(query<HTMLSelectElement>(fixture, 'folder-parent')!.value).toBe('');
      const options = Array.from(query<HTMLSelectElement>(fixture, 'folder-parent')!.options).map((o) => o.textContent?.trim());
      expect(options).toEqual(['banners.folders.topLevel', 'Archive', 'Campaigns', 'Summer', 'Az']);
    });

    it('defaults the parent to the chosen folder', async () => {
      const fixture = await loaded('admin', 3);

      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      expect(query<HTMLSelectElement>(fixture, 'folder-parent')!.value).toBe('3');
    });

    it('keeps Create disabled until a name is typed', async () => {
      const fixture = await loaded('admin');
      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();
      expect(query<HTMLButtonElement>(fixture, 'folder-submit')!.disabled).toBe(true);

      type(query<HTMLInputElement>(fixture, 'folder-name')!, '   ');
      fixture.detectChanges();
      expect(query<HTMLButtonElement>(fixture, 'folder-submit')!.disabled).toBe(true);

      type(query<HTMLInputElement>(fixture, 'folder-name')!, 'New');
      fixture.detectChanges();
      expect(query<HTMLButtonElement>(fixture, 'folder-submit')!.disabled).toBe(false);
    });

    it('POSTs name and parentId, then closes, expands the parent, shows a toast and chooses the new folder', async () => {
      const fixture = await loaded('admin');
      const toast = TestBed.inject(ToastService);
      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      type(query<HTMLInputElement>(fixture, 'folder-name')!, '  Spring ');
      const select = query<HTMLSelectElement>(fixture, 'folder-parent')!;
      select.value = '1';
      select.dispatchEvent(new Event('change'));
      query<HTMLFormElement>(fixture, 'folder-form')!.dispatchEvent(new Event('submit'));

      const req = httpMock.expectOne(API);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Spring', parentId: 1 });
      req.flush(folder(10, 'Spring', 1));
      fixture.detectChanges();

      expect(query(fixture, 'folder-form')).toBeNull();
      expect(rowNames(fixture)).toEqual(['Archive', 'Campaigns', 'Spring', 'Summer']);
      expect(fixture.componentInstance.changes).toEqual([10]);
      expect(toast.toasts().length).toBe(1);
    });

    it('creates a top-level folder with parentId null', async () => {
      const fixture = await loaded('admin');
      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      type(query<HTMLInputElement>(fixture, 'folder-name')!, 'Top');
      query<HTMLFormElement>(fixture, 'folder-form')!.dispatchEvent(new Event('submit'));

      const req = httpMock.expectOne(API);
      expect(req.request.body).toEqual({ name: 'Top', parentId: null });
      req.flush(folder(11, 'Top'));
    });

    it('keeps the form open with the typed name when the request fails', async () => {
      const fixture = await loaded('admin');
      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      type(query<HTMLInputElement>(fixture, 'folder-name')!, 'Dup');
      query<HTMLFormElement>(fixture, 'folder-form')!.dispatchEvent(new Event('submit'));
      httpMock.expectOne(API).flush({ message: 'exists' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(query(fixture, 'folder-form')).not.toBeNull();
      expect(query<HTMLInputElement>(fixture, 'folder-name')!.value).toBe('Dup');
      expect(fixture.componentInstance.changes).toEqual([]);
    });

    it('closes the form with Cancel without sending anything', async () => {
      const fixture = await loaded('admin');
      query<HTMLButtonElement>(fixture, 'new-folder')!.click();
      fixture.detectChanges();

      query<HTMLButtonElement>(fixture, 'folder-cancel')!.click();
      fixture.detectChanges();

      expect(query(fixture, 'folder-form')).toBeNull();
    });
  });
});
