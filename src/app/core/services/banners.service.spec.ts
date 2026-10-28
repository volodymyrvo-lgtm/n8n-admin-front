import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
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

  describe('deleteAll', () => {
    it('sends DELETE /banners with no body and reports how many were deleted', () => {
      const onSuccess = vi.fn();
      service.deleteAll({ onSuccess });
      expect(service.deleting()).toBe(true);

      const req = httpMock.expectOne(API);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toBeNull();
      req.flush({ deletedCount: 12 });

      expect(onSuccess).toHaveBeenCalledWith(12);
      expect(service.deleting()).toBe(false);
    });

    it('reports a failure and allows trying again', () => {
      const onError = vi.fn();
      service.deleteAll({ onError });
      httpMock.expectOne(API).flush({ message: 'storage down' }, { status: 500, statusText: 'Server Error' });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(service.deleting()).toBe(false);

      service.deleteAll();
      httpMock.expectOne(API).flush({ deletedCount: 0 });
    });

    it('ignores a second call while the first is still running', () => {
      service.deleteAll();
      service.deleteAll();

      httpMock.expectOne(API).flush({ deletedCount: 3 });
    });
  });

  describe('deleteMany', () => {
    it('POSTs { ids } to /banners/bulk-delete and reports the count the backend gives', () => {
      const onSuccess = vi.fn();
      service.deleteMany(['id-1', 'id-2'], { onSuccess });
      expect(service.deleting()).toBe(true);

      const req = httpMock.expectOne(`${API}/bulk-delete`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ids: ['id-1', 'id-2'] });
      req.flush({ deletedCount: 2 });

      expect(onSuccess).toHaveBeenCalledWith(2);
      expect(service.deleting()).toBe(false);
    });

    it('falls back to the number of requested ids when the answer has no count (or no body)', () => {
      const onSuccess = vi.fn();
      service.deleteMany(['id-1', 'id-2', 'id-3'], { onSuccess });
      httpMock.expectOne(`${API}/bulk-delete`).flush(null);

      expect(onSuccess).toHaveBeenCalledWith(3);
    });

    it('reports a failure and allows trying again', () => {
      const onError = vi.fn();
      service.deleteMany(['id-1'], { onError });
      httpMock.expectOne(`${API}/bulk-delete`).flush({ message: 'storage down' }, { status: 500, statusText: 'Server Error' });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(service.deleting()).toBe(false);
    });

    it('sends nothing for an empty list and ignores a call while another deletion runs', () => {
      service.deleteMany([]);
      httpMock.expectNone(`${API}/bulk-delete`);

      service.deleteMany(['id-1']);
      service.deleteMany(['id-2']);
      service.deleteAll();
      httpMock.expectOne(`${API}/bulk-delete`).flush({ deletedCount: 1 });
      httpMock.expectNone(API);
    });
  });

  describe('send', () => {
    it('POSTs an empty body to send everything unsent to the root folder', () => {
      const onSuccess = vi.fn();
      service.send({}, { onSuccess });
      expect(service.sending()).toBe(true);

      const req = httpMock.expectOne(`${API}/send`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(service.sending()).toBe(false);
    });

    it('sends only parentId when a folder is chosen', () => {
      service.send({ parentId: 12 });

      expect(httpMock.expectOne(`${API}/send`).request.body).toEqual({ parentId: 12 });
    });

    it('treats a null parentId as the root: no parentId in the body', () => {
      service.send({ parentId: null });

      expect(httpMock.expectOne(`${API}/send`).request.body).toEqual({});
    });

    it('sends the ids of the selected banners, with the folder when there is one', () => {
      service.send({ ids: ['a', 'b'] });
      httpMock.expectOne(`${API}/send`).flush({});
      service.send({ ids: ['c'], parentId: 7 });

      expect(httpMock.expectOne(`${API}/send`).request.body).toEqual({ ids: ['c'], parentId: 7 });
    });

    it('never turns an empty selection into "send everything"', () => {
      service.send({ ids: [] });

      httpMock.expectNone(`${API}/send`);
      expect(service.sending()).toBe(false);
    });

    it('reports a failure and allows trying again', () => {
      const onError = vi.fn();
      service.send({}, { onError });
      httpMock.expectOne(`${API}/send`).flush({ message: 'n8n down' }, { status: 500, statusText: 'Server Error' });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(service.sending()).toBe(false);
    });

    it('ignores a call while another send or a deletion runs, and blocks deletion while sending', () => {
      service.send({});
      service.send({ parentId: 1 });
      service.deleteAll();
      service.deleteMany(['x']);
      httpMock.expectOne(`${API}/send`).flush(null);
      httpMock.expectNone(API);
      httpMock.expectNone(`${API}/bulk-delete`);

      service.deleteAll();
      service.send({});
      httpMock.expectOne(API).flush({ deletedCount: 0 });
      httpMock.expectNone(`${API}/send`);
    });
  });

  describe('replaceImage', () => {
    const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'new.png', { type: 'image/png' });

    it('PUTs multipart form data with the file to /banners/:id/image and sets no Content-Type', () => {
      const onSuccess = vi.fn();
      const file = png();
      service.replaceImage('b-1', file, undefined, { onSuccess });
      expect(service.replacing()).toBe(true);

      const req = httpMock.expectOne(`${API}/b-1/image`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBeInstanceOf(FormData);
      const body = req.request.body as FormData;
      expect(body.get('file')).toBeInstanceOf(File);
      expect((body.get('file') as File).name).toBe('new.png');
      expect(body.has('figmaImageName')).toBe(false);
      expect(req.request.headers.has('Content-Type')).toBe(false);
      req.flush(null);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(service.replacing()).toBe(false);
    });

    it('adds figmaImageName only when a new name is given', () => {
      service.replaceImage('b-1', png(), '2_az');

      const body = httpMock.expectOne(`${API}/b-1/image`).request.body as FormData;
      expect(body.get('figmaImageName')).toBe('2_az');
    });

    it('reports a failure and allows trying again', () => {
      const onError = vi.fn();
      service.replaceImage('b-1', png(), undefined, { onError });
      httpMock.expectOne(`${API}/b-1/image`).flush({ message: 'too big' }, { status: 413, statusText: 'Payload Too Large' });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(service.replacing()).toBe(false);
    });

    it('ignores a call while another upload, a send or a deletion runs', () => {
      service.replaceImage('b-1', png(), undefined);
      service.replaceImage('b-2', png(), undefined);
      service.send({});
      service.deleteAll();
      httpMock.expectOne(`${API}/b-1/image`).flush(null);
      httpMock.expectNone(`${API}/b-2/image`);
      httpMock.expectNone(`${API}/send`);
      httpMock.expectNone(API);
    });
  });
});
