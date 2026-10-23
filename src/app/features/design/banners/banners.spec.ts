import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { Banner } from '../../../core/models/banner.model';
import { BannersComponent } from './banners';

const API = 'http://localhost:3000/banners';

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

  async function setup(page?: string) {
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
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
});
