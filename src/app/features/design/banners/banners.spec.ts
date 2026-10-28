import { Component, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { Banner } from '../../../core/models/banner.model';
import { AuthService } from '../../../core/services/auth.service';
import { CustomerFoldersService } from '../../../core/services/customer-folders.service';
import { ToastService } from '../../../core/services/toast.service';
import { BannerFoldersComponent } from './banner-folders/banner-folders';
import { BannersComponent } from './banners';

const API = 'http://localhost:3000/banners';

/** The folder tree has its own spec (and its own requests) - here it only shows what the page passes it. */
@Component({ selector: 'app-banner-folders', template: '' })
class StubBannerFoldersComponent {
  readonly selectedId = input<number | null>(null);
  readonly selectedChange = output<number | null>();
}

function makeBanner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'b1',
    jobId: 'f5409999-c87b-4ecb-bae6-ecd19832eb1c',
    figmaImageName: '1_az',
    mimeType: 'image/png',
    sizeBytes: 706899,
    status: 'pending',
    createdAt: '2026-10-23T11:01:16.934Z',
    imageUrl: 'https://storage.example/sign/b1.png?token=t',
    ...overrides,
  };
}

describe('BannersComponent', () => {
  let httpMock: HttpTestingController;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function setup(page?: string, role: 'admin' | 'user' | 'reader' = 'user') {
    queryParams = new BehaviorSubject(convertToParamMap(page ? { page } : {}));
    await TestBed.configureTestingModule({
      imports: [BannersComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    })
      .overrideComponent(BannersComponent, {
        remove: { imports: [BannerFoldersComponent] },
        add: { imports: [StubBannerFoldersComponent] },
      })
      .compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(AuthService).currentUser.set({ id: '1', username: 'x@royale.az', role });
  }

  function create(items: Banner[], options: { total?: number; page?: number } = {}) {
    const fixture = TestBed.createComponent(BannersComponent);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === API);
    req.flush({ items, total: options.total ?? items.length, page: options.page ?? 1, limit: 20 });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('renders a card per banner: picture, Figma name, status, date, size and the job', async () => {
    await setup();
    const fixture = create([makeBanner(), makeBanner({ id: 'b2', figmaImageName: '2_az', jobId: null })]);
    const el: HTMLElement = fixture.nativeElement;

    const cards = el.querySelectorAll('[data-testid="banner-card"]');
    expect(cards).toHaveLength(2);

    const first = cards[0];
    const img = first.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://storage.example/sign/b1.png?token=t');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('1_az');
    expect(first.querySelector('.banner-card__name')?.textContent?.trim()).toBe('1_az');
    expect(first.querySelector('[data-testid="status"]')?.textContent?.trim()).toBe('banners.status.pending');
    expect(first.textContent).toContain('690 KB');
    const job = first.querySelector('[data-testid="job"]');
    expect(job?.textContent).toContain('f5409999');
    expect(job?.getAttribute('title')).toBe('f5409999-c87b-4ecb-bae6-ecd19832eb1c');

    // jobId: null - no job link at all.
    expect(cards[1].querySelector('[data-testid="job"]')).toBeNull();
  });

  it('shows an unknown status as the raw value instead of breaking', async () => {
    await setup();
    const fixture = create([makeBanner({ status: 'archived' })]);
    expect(fixture.nativeElement.querySelector('[data-testid="status"]')?.textContent?.trim()).toBe('archived');
  });

  it('shows the empty state when there are no banners', async () => {
    await setup();
    const fixture = create([]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('app-empty-state')?.textContent).toContain('banners.emptyTitle');
    expect(el.querySelector('[data-testid="banner-card"]')).toBeNull();
  });

  it('shows a placeholder with a refresh button when imageUrl is null, and the banner stays in the list', async () => {
    await setup();
    const fixture = create([makeBanner({ imageUrl: null })]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid="image-placeholder"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="banner-card"]')).toHaveLength(1);

    (el.querySelector('[data-testid="refresh-image"]') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === API).flush({ items: [makeBanner()], total: 1, page: 1, limit: 20 });
    fixture.detectChanges();
    expect(el.querySelector('img')).not.toBeNull();
  });

  it('asks for fresh links once when a picture fails to load, then falls back to the placeholder', async () => {
    await setup();
    const fixture = create([makeBanner()]);
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector('img')!.dispatchEvent(new Event('error'));
    const refresh = httpMock.expectOne((r) => r.url === API);
    expect(refresh.request.params.get('page')).toBe('1');
    // Quiet: the list stays on screen while the links are refreshed.
    expect(el.querySelector('[data-testid="banner-card"]')).not.toBeNull();
    refresh.flush({ items: [makeBanner({ imageUrl: 'https://storage.example/sign/b1.png?token=new' })], total: 1, page: 1, limit: 20 });
    fixture.detectChanges();
    expect(el.querySelector('img')!.getAttribute('src')).toContain('token=new');

    // Fails again with the fresh link: no second reload, a placeholder instead.
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    httpMock.expectNone((r) => r.url === API);
    fixture.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid="image-placeholder"]')).not.toBeNull();
  });

  it('refreshes once - and keeps every picture - when several fail at the same time', async () => {
    await setup();
    const fixture = create([makeBanner({ id: 'b1' }), makeBanner({ id: 'b2' }), makeBanner({ id: 'b3' })]);
    const el: HTMLElement = fixture.nativeElement;

    // All three links expired together; the browser reports the failures one by one.
    el.querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('error')));
    const refresh = httpMock.expectOne((r) => r.url === API);
    fixture.detectChanges();
    refresh.flush({
      items: ['b1', 'b2', 'b3'].map((id) => makeBanner({ id, imageUrl: `https://storage.example/sign/${id}.png?token=new` })),
      total: 3,
      page: 1,
      limit: 20,
    });
    fixture.detectChanges();

    expect(el.querySelectorAll('img')).toHaveLength(3);
    expect(el.querySelector('[data-testid="image-placeholder"]')).toBeNull();
  });

  it('reads the page from the URL and asks for it', async () => {
    await setup('3');
    const fixture = TestBed.createComponent(BannersComponent);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ items: [makeBanner()], total: 50, page: 3, limit: 20 });
  });

  it('treats a nonsense page in the URL as page 1', async () => {
    await setup('abc');
    const fixture = TestBed.createComponent(BannersComponent);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('puts the page into the URL when the paginator changes it, and drops it for page 1', async () => {
    await setup();
    const fixture = create([makeBanner()], { total: 45 });
    const router = TestBed.inject(Router);

    fixture.componentInstance['goToPage'](2);
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: 2 }, queryParamsHandling: 'merge' }));

    fixture.componentInstance['goToPage'](1);
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { page: null } }));
    expect(fixture.componentInstance['totalPages']()).toBe(3);
  });

  it('moves to the last page when the URL points beyond it', async () => {
    await setup('5');
    const fixture = create([], { total: 45, page: 5 });
    const router = TestBed.inject(Router);

    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: 3 }, replaceUrl: true }));
    expect(fixture.nativeElement.querySelector('[data-testid="banner-card"]')).toBeNull();
  });

  it('shows an alert with a retry button when loading fails', async () => {
    await setup();
    const fixture = TestBed.createComponent(BannersComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === API).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="load-failed"]')).not.toBeNull();
    (el.querySelector('[data-testid="retry"]') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === API).flush({ items: [makeBanner()], total: 1, page: 1, limit: 20 });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="banner-card"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="load-failed"]')).toBeNull();
  });

  describe('Cancel all', () => {
    const cancelAllButton = (el: HTMLElement) => el.querySelector('[data-testid="cancel-all"]') as HTMLButtonElement | null;
    const typeWord = async (fixture: ReturnType<typeof create>, value: string) => {
      const input = fixture.nativeElement.querySelector('[data-testid="confirm-input"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const confirmButton = (fixture: ReturnType<typeof create>) =>
      fixture.nativeElement.querySelector('[data-testid="confirm"]') as HTMLButtonElement;

    it('is shown to admins only', async () => {
      await setup(undefined, 'admin');
      expect(cancelAllButton(create([makeBanner()]).nativeElement)).not.toBeNull();
    });

    it('is not shown to a user or a reader, and the handler refuses them too', async () => {
      await setup(undefined, 'reader');
      const fixture = create([makeBanner()]);
      expect(cancelAllButton(fixture.nativeElement)).toBeNull();

      fixture.componentInstance['askCancelAll']();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
    });

    it('is not shown when there are no banners to cancel', async () => {
      await setup(undefined, 'admin');
      expect(cancelAllButton(create([]).nativeElement)).toBeNull();
    });

    it('asks first - and sends nothing until the word DELETE is typed and confirmed', async () => {
      await setup(undefined, 'admin');
      const fixture = create([makeBanner()]);

      cancelAllButton(fixture.nativeElement)!.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).not.toBeNull();
      expect(confirmButton(fixture).disabled).toBe(true);
      httpMock.expectNone({ method: 'DELETE', url: API });

      await typeWord(fixture, 'DELETE');
      expect(confirmButton(fixture).disabled).toBe(false);
    });

    it('keeping the banners closes the dialog without a request', async () => {
      await setup(undefined, 'admin');
      const fixture = create([makeBanner()]);

      cancelAllButton(fixture.nativeElement)!.click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[data-testid="cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      httpMock.expectNone({ method: 'DELETE', url: API });
    });

    it('sends DELETE /banners, then closes the dialog, says how many were deleted and reloads page 1', async () => {
      await setup(undefined, 'admin');
      const fixture = create([makeBanner()], { total: 1 });
      const toast = TestBed.inject(ToastService);

      cancelAllButton(fixture.nativeElement)!.click();
      fixture.detectChanges();
      await typeWord(fixture, 'DELETE');
      confirmButton(fixture).click();
      fixture.detectChanges();

      const del = httpMock.expectOne({ method: 'DELETE', url: API });
      del.flush({ deletedCount: 12 });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      expect(toast.toasts().some((t) => t.type === 'success')).toBe(true);

      const reload = httpMock.expectOne((r) => r.url === API && r.method === 'GET');
      expect(reload.request.params.get('page')).toBe('1');
      reload.flush({ items: [], total: 0, page: 1, limit: 20 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-empty-state')).not.toBeNull();
    });

    it('goes back to page 1 through the URL when it was cancelled from a later page', async () => {
      await setup('3', 'admin');
      const fixture = create([makeBanner()], { total: 50, page: 3 });
      const router = TestBed.inject(Router);

      fixture.componentInstance['askCancelAll']();
      fixture.componentInstance['cancelAll']();
      httpMock.expectOne({ method: 'DELETE', url: API }).flush({ deletedCount: 50 });

      expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: null } }));
    });

    it('closes the dialog and reloads the list when the deletion fails halfway', async () => {
      await setup(undefined, 'admin');
      const fixture = create([makeBanner()]);

      fixture.componentInstance['askCancelAll']();
      fixture.componentInstance['cancelAll']();
      httpMock.expectOne({ method: 'DELETE', url: API }).flush({ message: 'storage down' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      httpMock.expectOne((r) => r.url === API && r.method === 'GET').flush({ items: [makeBanner()], total: 1, page: 1, limit: 20 });
    });
  });

  describe('Cancel selected', () => {
    const three = () => [makeBanner({ id: 'b1' }), makeBanner({ id: 'b2' }), makeBanner({ id: 'b3' })];
    const checks = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('[data-testid="select"]'));
    const tick = (fixture: ReturnType<typeof create>, ...indexes: number[]) => {
      const boxes = checks(fixture.nativeElement);
      indexes.forEach((i) => boxes[i].click());
      fixture.detectChanges();
    };
    const cancelSelected = (el: HTMLElement) => el.querySelector('[data-testid="cancel-selected"]') as HTMLButtonElement | null;

    it('puts a checkbox on every card for admins and users (they can send)', async () => {
      await setup(undefined, 'admin');
      expect(checks(create(three()).nativeElement)).toHaveLength(3);
    });

    it('gives a user the checkboxes and select-all too, but no "Cancel selected"', async () => {
      await setup(undefined, 'user');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;
      expect(checks(el)).toHaveLength(3);
      expect(el.querySelector('[data-testid="select-all"]')).not.toBeNull();

      tick(fixture, 0);
      expect(cancelSelected(el)).toBeNull();
    });

    it('gives a reader no checkboxes and no select-all', async () => {
      await setup(undefined, 'reader');
      const el: HTMLElement = create(three()).nativeElement;
      expect(checks(el)).toHaveLength(0);
      expect(el.querySelector('[data-testid="select-all"]')).toBeNull();
    });

    it('shows the count and the "Cancel selected" button only while something is ticked', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;
      expect(cancelSelected(el)).toBeNull();

      tick(fixture, 0, 2);
      expect(el.querySelector('[data-testid="selected-count"]')?.textContent).toContain('banners.selected');
      expect(cancelSelected(el)).not.toBeNull();
      expect(el.querySelectorAll('.banner-card--selected')).toHaveLength(2);

      tick(fixture, 0, 2);
      expect(cancelSelected(el)).toBeNull();
    });

    it('"select all" ticks the whole page, and unticks it when everything is ticked', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;
      const all = el.querySelector('[data-testid="select-all"]') as HTMLInputElement;

      all.click();
      fixture.detectChanges();
      expect(checks(el).every((box) => box.checked)).toBe(true);
      expect(all.checked).toBe(true);

      all.click();
      fixture.detectChanges();
      expect(checks(el).some((box) => box.checked)).toBe(false);
    });

    it('asks first and sends nothing until confirmed - then POSTs exactly the ticked ids', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;
      const toast = TestBed.inject(ToastService);

      tick(fixture, 0, 2);
      cancelSelected(el)!.click();
      fixture.detectChanges();
      expect(el.querySelector('app-confirm-dialog')).not.toBeNull();
      // No word to type for a partial cancel.
      expect(el.querySelector('[data-testid="confirm-input"]')).toBeNull();
      httpMock.expectNone({ method: 'POST', url: `${API}/bulk-delete` });

      (el.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const req = httpMock.expectOne({ method: 'POST', url: `${API}/bulk-delete` });
      expect(req.request.body).toEqual({ ids: ['b1', 'b3'] });
      req.flush({ deletedCount: 2 });
      fixture.detectChanges();

      expect(el.querySelector('app-confirm-dialog')).toBeNull();
      expect(toast.toasts().some((t) => t.type === 'success')).toBe(true);
      // The page is reloaded, and the selection is gone.
      httpMock
        .expectOne((r) => r.url === API && r.method === 'GET')
        .flush({ items: [makeBanner({ id: 'b2' })], total: 1, page: 1, limit: 20 });
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="banner-card"]')).toHaveLength(1);
      expect(cancelSelected(el)).toBeNull();
    });

    it('keeping them closes the dialog without a request and keeps the ticks', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;

      tick(fixture, 1);
      cancelSelected(el)!.click();
      fixture.detectChanges();
      (el.querySelector('[data-testid="cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('app-confirm-dialog')).toBeNull();
      expect(cancelSelected(el)).not.toBeNull();
      httpMock.expectNone({ method: 'POST', url: `${API}/bulk-delete` });
    });

    it('reloads the list when the deletion fails, keeping the ticks of banners that are still there', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      const el: HTMLElement = fixture.nativeElement;

      tick(fixture, 0, 1);
      fixture.componentInstance['askCancelSelected']();
      fixture.componentInstance['cancelSelected']();
      httpMock.expectOne({ method: 'POST', url: `${API}/bulk-delete` }).flush({ message: 'storage down' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(el.querySelector('app-confirm-dialog')).toBeNull();

      // b1 was deleted before the failure, b2 is still there and stays ticked.
      httpMock
        .expectOne((r) => r.url === API && r.method === 'GET')
        .flush({ items: [makeBanner({ id: 'b2' }), makeBanner({ id: 'b3' })], total: 2, page: 1, limit: 20 });
      fixture.detectChanges();
      expect(checks(el).map((box) => box.checked)).toEqual([true, false]);
    });

    it('drops the ticks of banners that are no longer on the page', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());

      tick(fixture, 0, 1);
      expect(fixture.componentInstance['selectedCount']()).toBe(2);

      fixture.componentInstance['reload']();
      httpMock.expectOne((r) => r.url === API).flush({ items: [makeBanner({ id: 'b9' })], total: 1, page: 1, limit: 20 });
      fixture.detectChanges();
      expect(fixture.componentInstance['selectedCount']()).toBe(0);
    });

    it('refuses to cancel anything for a non-admin even if the handler is called', async () => {
      await setup(undefined, 'reader');
      const fixture = create(three());

      fixture.componentInstance['toggleSelected']('b1');
      fixture.componentInstance['askCancelSelected']();
      fixture.componentInstance['cancelSelected']();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      httpMock.expectNone({ method: 'POST', url: `${API}/bulk-delete` });
    });
  });
  describe('folders', () => {
    function folders(fixture: ReturnType<typeof create>) {
      return fixture.debugElement.query(By.directive(StubBannerFoldersComponent));
    }

    it('shows the folder tree beside the gallery, even with no banners', async () => {
      await setup(undefined, 'user');
      const fixture = create([]);

      expect(folders(fixture)).not.toBeNull();
    });

    it('passes the folder from the URL to the tree', async () => {
      await setup(undefined, 'user');
      queryParams.next(convertToParamMap({ folder: '7' }));
      const fixture = create([makeBanner()]);

      expect(folders(fixture).componentInstance.selectedId()).toBe(7);
    });

    it('passes no folder for a missing or invalid ?folder=', async () => {
      await setup(undefined, 'user');
      queryParams.next(convertToParamMap({ folder: 'abc' }));
      const fixture = create([makeBanner()]);

      expect(folders(fixture).componentInstance.selectedId()).toBeNull();
    });

    it('puts the chosen folder in the URL, keeping the page', async () => {
      await setup('2', 'user');
      const fixture = create([makeBanner()], { page: 2, total: 40 });
      const navigate = TestBed.inject(Router).navigate as ReturnType<typeof vi.fn>;

      folders(fixture).componentInstance.selectedChange.emit(5);

      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { folder: 5 }, queryParamsHandling: 'merge' }));
    });

    it('removes ?folder= when the choice is cleared', async () => {
      await setup(undefined, 'user');
      const fixture = create([makeBanner()]);
      const navigate = TestBed.inject(Router).navigate as ReturnType<typeof vi.fn>;

      folders(fixture).componentInstance.selectedChange.emit(null);

      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { folder: null } }));
    });

    it('does not reload the banners when only the folder changes', async () => {
      await setup(undefined, 'user');
      create([makeBanner()]);

      queryParams.next(convertToParamMap({ folder: '3' }));

      httpMock.expectNone((r) => r.url === API);
    });
  });
  describe('sending', () => {
    const SEND = `${API}/send`;
    const three = () => [makeBanner({ id: 'b1' }), makeBanner({ id: 'b2' }), makeBanner({ id: 'b3' })];
    const q = (fixture: ReturnType<typeof create>, id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
    const tickBanners = (fixture: ReturnType<typeof create>, ...indexes: number[]) => {
      const boxes = fixture.nativeElement.querySelectorAll('[data-testid="select"]') as NodeListOf<HTMLInputElement>;
      indexes.forEach((i) => boxes[i].click());
      fixture.detectChanges();
    };
    const reloadAfterSend = (fixture: ReturnType<typeof create>) => {
      httpMock.expectOne((r) => r.url === API).flush({ items: three(), total: 3, page: 1, limit: 20 });
      fixture.detectChanges();
    };
    const withFolders = (fixture: ReturnType<typeof create>) => {
      TestBed.inject(CustomerFoldersService).folders.set([
        { id: 1, name: 'Campaigns', parentId: null, createdAt: '', updatedAt: '' },
        { id: 12, name: 'Summer', parentId: 1, createdAt: '', updatedAt: '' },
      ]);
      fixture.detectChanges();
    };

    it.each(['admin', 'user'] as const)('offers "Send all" and "Send selected" to a %s', async (role) => {
      await setup(undefined, role);
      const fixture = create(three());

      expect(q(fixture, 'send-all')).not.toBeNull();
      expect(q(fixture, 'send-selected')).toBeNull();
      tickBanners(fixture, 0);
      expect(q(fixture, 'send-selected')).not.toBeNull();
    });

    it('does not offer sending to a reader, and the handlers refuse too', async () => {
      await setup(undefined, 'reader');
      const fixture = create(three());

      expect(q(fixture, 'send-all')).toBeNull();
      fixture.componentInstance['askSend']('all');
      fixture.componentInstance['send']();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      httpMock.expectNone(SEND);
    });

    it('has no "Send all" when there are no banners', async () => {
      await setup(undefined, 'user');

      expect(q(create([]), 'send-all')).toBeNull();
    });

    it('asks first, then sends an empty body to the root when no folder is chosen, and reloads', async () => {
      await setup(undefined, 'user');
      const fixture = create(three());

      q(fixture, 'send-all')!.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).not.toBeNull();
      httpMock.expectNone(SEND);

      q(fixture, 'confirm')!.click();
      const req = httpMock.expectOne(SEND);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(1);
      reloadAfterSend(fixture);
    });

    it('sends { parentId } to the chosen folder', async () => {
      await setup(undefined, 'user');
      queryParams.next(convertToParamMap({ folder: '12' }));
      const fixture = create(three());
      withFolders(fixture);

      q(fixture, 'send-all')!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance['destinationLabel']()).toBe('Campaigns / Summer');
      q(fixture, 'confirm')!.click();

      const req = httpMock.expectOne(SEND);
      expect(req.request.body).toEqual({ parentId: 12 });
      req.flush(null);
      reloadAfterSend(fixture);
    });

    it('sends the ticked ids, with the folder, and clears the selection', async () => {
      await setup(undefined, 'user');
      queryParams.next(convertToParamMap({ folder: '12' }));
      const fixture = create(three());
      withFolders(fixture);
      tickBanners(fixture, 0, 2);

      q(fixture, 'send-selected')!.click();
      fixture.detectChanges();
      q(fixture, 'confirm')!.click();

      const req = httpMock.expectOne(SEND);
      expect(req.request.body).toEqual({ ids: ['b1', 'b3'], parentId: 12 });
      req.flush(null);
      reloadAfterSend(fixture);

      expect(fixture.componentInstance['selectedCount']()).toBe(0);
    });

    it('sends only ids to the root when nothing but banners is chosen', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      tickBanners(fixture, 1);

      q(fixture, 'send-selected')!.click();
      fixture.detectChanges();
      q(fixture, 'confirm')!.click();

      const req = httpMock.expectOne(SEND);
      expect(req.request.body).toEqual({ ids: ['b2'] });
      req.flush(null);
      reloadAfterSend(fixture);
    });

    it('blocks sending while the chosen folder is not in the folder list, instead of silently sending to the root', async () => {
      await setup(undefined, 'user');
      queryParams.next(convertToParamMap({ folder: '404' }));
      const fixture = create(three());

      expect(q(fixture, 'send-all')!.disabled).toBe(true);
      fixture.componentInstance['askSend']('all');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();

      withFolders(fixture);
      expect(q(fixture, 'send-all')!.disabled).toBe(true);
      TestBed.inject(CustomerFoldersService).folders.update((list) => [...list, { id: 404, name: 'Late', parentId: null, createdAt: '', updatedAt: '' }]);
      fixture.detectChanges();
      expect(q(fixture, 'send-all')!.disabled).toBe(false);
    });

    it('closes the dialog and reloads when the send fails, keeping the selection', async () => {
      await setup(undefined, 'user');
      const fixture = create(three());
      tickBanners(fixture, 0);

      q(fixture, 'send-selected')!.click();
      fixture.detectChanges();
      q(fixture, 'confirm')!.click();
      httpMock.expectOne(SEND).flush({ message: 'n8n down' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);
      reloadAfterSend(fixture);
      expect(fixture.componentInstance['selectedCount']()).toBe(1);
    });

    it('does not open "Send selected" with nothing ticked', async () => {
      await setup(undefined, 'user');
      const fixture = create(three());

      fixture.componentInstance['askSend']('selected');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
    });
  });
  describe('replacing a picture', () => {
    const three = () => [makeBanner({ id: 'b1', figmaImageName: '1_az' }), makeBanner({ id: 'b2' })];
    const q = (fixture: ReturnType<typeof create>, id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const png = () => new File([new Uint8Array(10)], 'new.png', { type: 'image/png' });

    function openDialog(fixture: ReturnType<typeof create>, index = 0) {
      (fixture.nativeElement.querySelectorAll('[data-testid="replace"]')[index] as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function chooseFile(fixture: ReturnType<typeof create>, file: File) {
      const input = q(fixture, 'replace-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: { 0: file, length: 1, item: () => file } });
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it.each(['user', 'reader'] as const)('shows no Replace button to a %s, and the handler refuses too', async (role) => {
      await setup(undefined, role);
      const fixture = create(three());

      expect(q(fixture, 'replace')).toBeNull();
      fixture.componentInstance['askReplace'](three()[0]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-banner-replace-dialog')).toBeNull();
    });

    it('puts a Replace button on every card for an admin and opens the dialog for that banner', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());

      expect(fixture.nativeElement.querySelectorAll('[data-testid="replace"]')).toHaveLength(2);
      openDialog(fixture, 0);

      expect(fixture.nativeElement.querySelector('app-banner-replace-dialog')).not.toBeNull();
      expect((q(fixture, 'replace-name') as HTMLInputElement).value).toBe('1_az');
    });

    it('uploads the file with PUT /banners/:id/image, then closes, toasts and refreshes the list silently', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      openDialog(fixture, 0);
      chooseFile(fixture, png());

      (q(fixture, 'replace-submit') as HTMLButtonElement).click();
      const req = httpMock.expectOne(`${API}/b1/image`);
      expect(req.request.method).toBe('PUT');
      expect((req.request.body as FormData).has('figmaImageName')).toBe(false);
      req.flush(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-banner-replace-dialog')).toBeNull();
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(1);
      httpMock.expectOne((r) => r.url === API).flush({ items: three(), total: 2, page: 1, limit: 20 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-spinner')).toBeNull();
    });

    it('sends figmaImageName only when the name was changed', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      openDialog(fixture, 0);
      chooseFile(fixture, png());
      const name = q(fixture, 'replace-name') as HTMLInputElement;
      name.value = '9_az';
      name.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (q(fixture, 'replace-submit') as HTMLButtonElement).click();
      const req = httpMock.expectOne(`${API}/b1/image`);
      expect((req.request.body as FormData).get('figmaImageName')).toBe('9_az');
      req.flush(null);
      httpMock.expectOne((r) => r.url === API).flush({ items: three(), total: 2, page: 1, limit: 20 });
    });

    it('keeps the dialog open on a failure so the file can be changed', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      openDialog(fixture, 0);
      chooseFile(fixture, png());

      (q(fixture, 'replace-submit') as HTMLButtonElement).click();
      httpMock.expectOne(`${API}/b1/image`).flush({ message: 'bad' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-banner-replace-dialog')).not.toBeNull();
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);
      httpMock.expectNone((r) => r.url === API);
    });

    it('closes with Cancel without uploading', async () => {
      await setup(undefined, 'admin');
      const fixture = create(three());
      openDialog(fixture, 0);

      (q(fixture, 'replace-cancel') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-banner-replace-dialog')).toBeNull();
    });
  });
});
