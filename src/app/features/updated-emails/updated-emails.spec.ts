import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { UpdatedEmailsComponent } from './updated-emails';

const LIST_URL = (r: { url: string }) => r.url === 'http://localhost:3000/updated-emails';

const ITEMS = [
  { id: 'u-2', emailId: '18_ru', createdAt: '2026-10-30T13:02:07.099Z', updatedAt: '2026-10-30T13:02:07.099Z' },
  { id: 'u-1', emailId: '1_en', createdAt: '2026-10-30T12:14:35.452Z', updatedAt: '2026-10-30T12:14:35.452Z' },
];

const BODY = '<!doctype html><html><head><title>Hi</title></head><body><a href="https://example.com">x</a><script>alert(1)</script></body></html>';

describe('UpdatedEmailsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatedEmailsComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function load(items = ITEMS, total = items.length) {
    const fixture = TestBed.createComponent(UpdatedEmailsComponent);
    fixture.detectChanges();
    httpMock.expectOne(LIST_URL).flush({ items, total, page: 1, limit: 20 });
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('lists the updated emails', () => {
    const rows = Array.from(el(load()).querySelectorAll('[data-testid=email-row]'));

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('18_ru');
    expect(rows[1].textContent).toContain('1_en');
  });

  it('shows the empty state when there are none', () => {
    const fixture = load([]);

    expect(el(fixture).querySelector('app-empty-state')).toBeTruthy();
    expect(el(fixture).querySelector('[data-testid=email-row]')).toBeNull();
  });

  it('offers a retry when the list could not be loaded', () => {
    const fixture = TestBed.createComponent(UpdatedEmailsComponent);
    fixture.detectChanges();
    httpMock.expectOne(LIST_URL).flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-testid=list-failed]')).toBeTruthy();
    (el(fixture).querySelector('[data-testid=list-failed] button') as HTMLButtonElement).click();
    httpMock.expectOne(LIST_URL).flush({ items: ITEMS, total: 2, page: 1, limit: 20 });
  });

  it('opens a modal with the email fetched by id, in a sandboxed iframe', () => {
    const fixture = load();

    (el(fixture).querySelectorAll('[data-testid=open-email]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-view-modal')).toBeTruthy();

    httpMock.expectOne('http://localhost:3000/updated-emails/u-1').flush({ ...ITEMS[1], body: BODY });
    fixture.detectChanges();

    const frame = el(fixture).querySelector('[data-testid=email-frame]') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.srcdoc).toContain('<base target="_blank">');
    expect(frame.srcdoc).toContain('<a href="https://example.com">x</a>');
    expect(el(fixture).querySelector('.panel__title')?.textContent).toContain('1_en');
  });

  it('closes the modal again', () => {
    const fixture = load();
    (el(fixture).querySelector('[data-testid=open-email]') as HTMLButtonElement).click();
    httpMock.expectOne('http://localhost:3000/updated-emails/u-2').flush({ ...ITEMS[0], body: BODY });
    fixture.detectChanges();

    (el(fixture).querySelector('[data-testid=close]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-view-modal')).toBeNull();
  });

  it('says so, and retries, when the email could not be loaded', () => {
    const fixture = load();
    (el(fixture).querySelector('[data-testid=open-email]') as HTMLButtonElement).click();
    httpMock.expectOne('http://localhost:3000/updated-emails/u-2').flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-testid=email-failed]')).toBeTruthy();
    expect(el(fixture).querySelector('[data-testid=email-frame]')).toBeNull();

    (el(fixture).querySelector('[data-testid=retry-email]') as HTMLButtonElement).click();
    httpMock.expectOne('http://localhost:3000/updated-emails/u-2').flush({ ...ITEMS[0], body: BODY });
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-testid=email-frame]')).toBeTruthy();
  });

  it('shows a paginator and fetches the chosen page', () => {
    const fixture = load(ITEMS, 45);

    expect(el(fixture).querySelector('app-paginator')).toBeTruthy();
    fixture.componentInstance['refresh'](2);
    const req = httpMock.expectOne(LIST_URL);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: ITEMS, total: 45, page: 2, limit: 20 });
  });
});
