import { TestBed } from '@angular/core/testing';
import { MjmlCompilerService } from './mjml-compiler.service';

const MJML = '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>';

describe('MjmlCompilerService', () => {
  let service: MjmlCompilerService;

  beforeEach(() => {
    service = TestBed.inject(MjmlCompilerService);
  });

  it('compiles MJML to email HTML and leaves personalization tokens alone', async () => {
    const result = await service.compile(MJML);

    expect(result.errors).toEqual([]);
    expect(result.html).toContain('<html');
    expect(result.html).toContain('Hello {{name}}');
  });

  it('reports a markup problem as an error instead of throwing', async () => {
    const result = await service.compile('<mjml><mj-body><mj-section><mj-column><mj-nope>x</mj-nope></mj-column></mj-section></mj-body></mjml>');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toBeTruthy();
  });

  it('does not throw for something that is not MJML at all', async () => {
    const result = await service.compile('just text');

    expect(result.errors.length).toBeGreaterThan(0);
  });
});
