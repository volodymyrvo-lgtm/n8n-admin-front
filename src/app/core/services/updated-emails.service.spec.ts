import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UpdatedEmailsService } from './updated-emails.service';

const ITEM = { id: 'u-1', emailId: '1_en', createdAt: '2026-10-30T12:14:35.452Z', updatedAt: '2026-10-30T12:14:35.452Z' };

describe('UpdatedEmailsService', () => {
  let httpMock: HttpTestingController;
  let service: UpdatedEmailsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(UpdatedEmailsService);
  });

  afterEach(() => httpMock.verify());

  it('loads a page of the list and keeps the paging info', () => {
    service.loadEmails({ page: 2 });
    expect(service.loading()).toBe(true);

    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/updated-emails');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({ items: [ITEM], total: 41, page: 2, limit: 20 });

    expect(service.emails()).toEqual([ITEM]);
    expect(service.total()).toBe(41);
    expect(service.page()).toBe(2);
    expect(service.limit()).toBe(20);
    expect(service.loading()).toBe(false);
    expect(service.failed()).toBe(false);
  });

  it('flags a failed list request so the page can offer a retry', () => {
    service.loadEmails();
    httpMock.expectOne((r) => r.url === 'http://localhost:3000/updated-emails').flush('boom', { status: 500, statusText: 'Error' });

    expect(service.failed()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('fetches one email by id', () => {
    let result: unknown;
    service.getEmail('u-1').subscribe((email) => (result = email));

    const req = httpMock.expectOne('http://localhost:3000/updated-emails/u-1');
    expect(req.request.method).toBe('GET');
    req.flush({ ...ITEM, body: '<html></html>' });

    expect(result).toEqual({ ...ITEM, body: '<html></html>' });
  });
});
