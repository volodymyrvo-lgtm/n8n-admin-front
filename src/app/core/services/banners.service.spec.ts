import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Banner } from '../models/banner.model';
import { BannersService } from './banners.service';

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

describe('BannersService', () => {
  let httpMock: HttpTestingController;
  let service: BannersService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BannersService);
  });

  afterEach(() => httpMock.verify());

  it('asks for the page with the default limit of 20 and sends nothing else', () => {
    service.load({ page: 3 });

    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual(['limit', 'page']);
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('limit')).toBe('20');
    expect(service.loading()).toBe(true);

    req.flush({ items: [makeBanner()], total: 41, page: 3, limit: 20 });

    expect(service.banners()).toHaveLength(1);
    expect([service.total(), service.page(), service.limit()]).toEqual([41, 3, 20]);
    expect(service.loading()).toBe(false);
    expect(service.failed()).toBe(false);
  });

  it('defaults to page 1', () => {
    service.load();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('marks the load as failed on an error and clears that on the next load', () => {
    service.load();
    httpMock.expectOne((r) => r.url === API).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(service.failed()).toBe(true);
    expect(service.loading()).toBe(false);

    service.load();
    expect(service.failed()).toBe(false);
    httpMock.expectOne((r) => r.url === API).flush({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('a silent load does not show the loading state', () => {
    service.load({ page: 1 }, { silent: true });
    expect(service.loading()).toBe(false);
    expect(service.refreshing()).toBe(true);
    httpMock.expectOne((r) => r.url === API).flush({ items: [makeBanner()], total: 1, page: 1, limit: 20 });
    expect(service.banners()).toHaveLength(1);
    expect(service.refreshing()).toBe(false);
  });

  it('a newer load cancels the one still running', () => {
    service.load({ page: 1 });
    const first = httpMock.expectOne((r) => r.url === API && r.params.get('page') === '1');
    service.load({ page: 2 });
    const second = httpMock.expectOne((r) => r.url === API && r.params.get('page') === '2');

    expect(first.cancelled).toBe(true);
    second.flush({ items: [makeBanner({ id: 'b2' })], total: 30, page: 2, limit: 20 });
    expect(service.banners().map((b) => b.id)).toEqual(['b2']);
  });
});
