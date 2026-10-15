import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuleSet } from '../models/rule-set.model';
import { RuleSetsService } from './rule-sets.service';

const API = 'http://localhost:3000';

const COMMUNICATION: RuleSet = { id: 'c-1', ruleName: 'Welcome', ruleSet: { a: '1' }, setType: ['email'], kind: 'communication' };
const SEO: RuleSet = { id: 's-1', ruleName: 'SEO tone', ruleSet: { b: '2' }, setType: ['email'], kind: 'seo' };

describe('RuleSetsService', () => {
  let service: RuleSetsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RuleSetsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('loadRuleSets', () => {
    it('fetches communication rules with a plain GET /rules (no kind param)', () => {
      service.loadRuleSets();
      const req = httpMock.expectOne((r) => r.url === `${API}/rules`);
      expect(req.request.params.has('kind')).toBe(false);
      req.flush([COMMUNICATION]);

      expect(service.ruleSets()).toEqual([COMMUNICATION]);
      expect(service.seoRuleSets()).toEqual([]);
      expect(service.loading()).toBe(false);
    });

    it('fetches SEO rules with GET /rules?kind=seo into their own list', () => {
      service.loadRuleSets('seo');
      const req = httpMock.expectOne((r) => r.url === `${API}/rules`);
      expect(req.request.params.get('kind')).toBe('seo');
      req.flush([SEO]);

      expect(service.seoRuleSets()).toEqual([SEO]);
      expect(service.ruleSets()).toEqual([]);
    });

    it('ruleSetsFor picks the list of a kind', () => {
      expect(service.ruleSetsFor('seo')).toBe(service.seoRuleSets);
      expect(service.ruleSetsFor('communication')).toBe(service.ruleSets);
    });
  });

  describe('addRuleSet', () => {
    const input = { ruleName: 'New', ruleSet: { k: 'v' }, setType: ['email' as const] };

    it('creates a communication rule via POST /rules without a kind in the body', () => {
      service.addRuleSet(input);
      const req = httpMock.expectOne(`${API}/rules`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ruleName: 'New', ruleSet: { k: 'v' }, setType: ['email'] });
      expect(req.request.body).not.toHaveProperty('kind');
      req.flush({});

      expect(service.ruleSets().length).toBe(1);
      expect(service.seoRuleSets().length).toBe(0);
    });

    it('creates an SEO rule via POST /rules/seo without a kind in the body', () => {
      service.addRuleSet(input, 'seo');
      const req = httpMock.expectOne(`${API}/rules/seo`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ruleName: 'New', ruleSet: { k: 'v' }, setType: ['email'] });
      expect(req.request.body).not.toHaveProperty('kind');
      req.flush({});

      expect(service.seoRuleSets().length).toBe(1);
      expect(service.ruleSets().length).toBe(0);
    });
  });

  describe('updateRuleSet', () => {
    const input = { ruleName: 'Renamed', ruleSet: {}, setType: ['email' as const] };

    it('PATCHes /rules/:id without a kind and then reloads the list of that kind', () => {
      service.updateRuleSet('s-1', input, 'seo');
      const patch = httpMock.expectOne(`${API}/rules/s-1`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).not.toHaveProperty('kind');
      patch.flush({});

      const reload = httpMock.expectOne((r) => r.url === `${API}/rules`);
      expect(reload.request.params.get('kind')).toBe('seo');
      reload.flush([{ ...SEO, ruleName: 'Renamed' }]);
      expect(service.seoRuleSets()[0].ruleName).toBe('Renamed');
    });

    it('reloads communication rules with the plain request by default', () => {
      service.updateRuleSet('c-1', input);
      httpMock.expectOne(`${API}/rules/c-1`).flush({});
      const reload = httpMock.expectOne((r) => r.url === `${API}/rules`);
      expect(reload.request.params.has('kind')).toBe(false);
      reload.flush([]);
    });
  });

  describe('deleteRuleSet', () => {
    it('removes the rule from whichever list holds it, after DELETE /rules/:id succeeds', () => {
      service.ruleSets.set([COMMUNICATION]);
      service.seoRuleSets.set([SEO]);
      const onSuccess = vi.fn();

      service.deleteRuleSet('s-1', onSuccess);
      const req = httpMock.expectOne(`${API}/rules/s-1`);
      expect(req.request.method).toBe('DELETE');
      expect(service.seoRuleSets().length).toBe(1);
      req.flush({});

      expect(service.seoRuleSets()).toEqual([]);
      expect(service.ruleSets()).toEqual([COMMUNICATION]);
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
