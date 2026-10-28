import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { CustomerFolder } from '../models/customer-folder.model';
import { CustomerFoldersService } from './customer-folders.service';

const API = 'http://localhost:3000/customer-folders';

function folder(id: number, name: string, parentId: number | null = null): CustomerFolder {
  return { id, name, parentId, createdAt: '2026-10-23T11:01:16.934Z', updatedAt: '2026-10-23T11:01:16.934Z' };
}

describe('CustomerFoldersService', () => {
  let httpMock: HttpTestingController;
  let service: CustomerFoldersService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CustomerFoldersService);
  });

  afterEach(() => httpMock.verify());

  describe('load', () => {
    it('GETs the list without query params and stores the items', () => {
      service.load();
      expect(service.loading()).toBe(true);

      const req = httpMock.expectOne(API);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ items: [folder(1, 'A'), folder(2, 'B', 1)], total: 2 });

      expect(service.folders().map((item) => item.id)).toEqual([1, 2]);
      expect(service.loading()).toBe(false);
      expect(service.failed()).toBe(false);
    });

    it('flags a failure and clears it on the next successful load', () => {
      service.load();
      httpMock.expectOne(API).flush({ message: 'x' }, { status: 500, statusText: 'Server Error' });
      expect(service.failed()).toBe(true);
      expect(service.loading()).toBe(false);

      service.load();
      expect(service.failed()).toBe(false);
      httpMock.expectOne(API).flush({ items: [], total: 0 });
      expect(service.failed()).toBe(false);
    });
  });

  describe('create', () => {
    it('POSTs the trimmed name and parent, appends the created folder and reports success', () => {
      const onSuccess = vi.fn();
      service.folders.set([folder(1, 'A')]);

      service.create('  Summer  ', 1, { onSuccess });
      expect(service.creating()).toBe(true);

      const req = httpMock.expectOne(API);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Summer', parentId: 1 });
      const created = folder(2, 'Summer', 1);
      req.flush(created);

      expect(service.folders()).toEqual([folder(1, 'A'), created]);
      expect(service.creating()).toBe(false);
      expect(onSuccess).toHaveBeenCalledWith(created);
    });

    it('sends parentId null for a top-level folder', () => {
      service.create('Top', null);

      expect(httpMock.expectOne(API).request.body).toEqual({ name: 'Top', parentId: null });
    });

    it('reports an error and keeps the list as it was', () => {
      const onError = vi.fn();
      service.folders.set([folder(1, 'A')]);

      service.create('Dup', null, { onError });
      httpMock.expectOne(API).flush({ message: 'exists' }, { status: 409, statusText: 'Conflict' });

      expect(onError).toHaveBeenCalled();
      expect(service.folders()).toEqual([folder(1, 'A')]);
      expect(service.creating()).toBe(false);
    });

    it('ignores a second create while one is running', () => {
      service.create('One', null);
      service.create('Two', null);

      const reqs = httpMock.match(API);
      expect(reqs.length).toBe(1);
      reqs[0].flush(folder(1, 'One'));
    });
  });
});
