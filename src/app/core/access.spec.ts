import { areasOf, homeUrlOf } from './access';

describe('access', () => {
  it('admin and user can open every part', () => {
    for (const role of ['admin', 'user']) {
      expect(areasOf(role)).toEqual(['jobs', 'documents', 'users', 'dashboard', 'errors']);
    }
  });

  it('a reader can only open the documents and the error logs', () => {
    expect(areasOf('reader')).toEqual(['documents', 'errors']);
  });

  it('an analyst can only open the dashboard', () => {
    expect(areasOf('analyst')).toEqual(['dashboard']);
  });

  it('tolerates any casing and gives an unknown or missing role no access', () => {
    expect(areasOf('READER')).toEqual(['documents', 'errors']);
    expect(areasOf('someone-new')).toEqual([]);
    expect(areasOf(null)).toEqual([]);
    expect(areasOf(undefined)).toEqual([]);
  });

  it('sends each role home to the first thing it can use', () => {
    expect(homeUrlOf('admin')).toBe('/flows');
    expect(homeUrlOf('user')).toBe('/flows');
    expect(homeUrlOf('reader')).toBe('/rule-sets');
    expect(homeUrlOf('analyst')).toBe('/usage');
    expect(homeUrlOf('mystery')).toBe('/flows');
  });
});
