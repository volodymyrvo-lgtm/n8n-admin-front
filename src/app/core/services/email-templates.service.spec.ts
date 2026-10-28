import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmailTemplatesService } from './email-templates.service';

describe('EmailTemplatesService', () => {
  let httpMock: HttpTestingController;
  let service: EmailTemplatesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EmailTemplatesService);
  });

  afterEach(() => httpMock.verify());

  it('lists the templates from the generated index', () => {
    let result: unknown;
    service.list().subscribe((items) => (result = items));

    httpMock.expectOne('/email-templates/index.json').flush([{ id: 'welcome-pack', name: 'Welcome pack' }]);

    expect(result).toEqual([{ id: 'welcome-pack', name: 'Welcome pack' }]);
  });

  it('loads a template: its manifest as JSON and its MJML as text', () => {
    let result: unknown;
    service.load('welcome-pack').subscribe((template) => (result = template));

    httpMock.expectOne('/email-templates/welcome-pack/template.json').flush({ id: 'welcome-pack', name: 'W', fields: [] });
    const mjml = httpMock.expectOne('/email-templates/welcome-pack/template.mjml');
    expect(mjml.request.responseType).toBe('text');
    mjml.flush('<mjml></mjml>');

    expect(result).toEqual({ manifest: { id: 'welcome-pack', name: 'W', fields: [] }, source: '<mjml></mjml>' });
  });

  it('encodes the id so it can not escape the templates folder', () => {
    service.load('../secret').subscribe();

    httpMock.expectOne('/email-templates/..%2Fsecret/template.json').flush({});
    httpMock.expectOne('/email-templates/..%2Fsecret/template.mjml').flush('');
  });
});
