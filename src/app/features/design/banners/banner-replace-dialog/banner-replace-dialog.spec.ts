import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Banner } from '../../../../core/models/banner.model';
import { BannerReplaceDialogComponent, BannerReplacement } from './banner-replace-dialog';

const BANNER: Banner = {
  id: 'b1',
  jobId: null,
  figmaImageName: '1_az',
  mimeType: 'image/png',
  sizeBytes: 100,
  status: 'pending',
  createdAt: '2026-10-23T11:01:16.934Z',
  imageUrl: null,
};

@Component({
  imports: [BannerReplaceDialogComponent],
  template: `<app-banner-replace-dialog [banner]="banner" [busy]="busy()" (submitted)="submits.push($event)" (cancelled)="cancels = cancels + 1" />`,
})
class HostComponent {
  banner = BANNER;
  submits: BannerReplacement[] = [];
  cancels = 0;
  readonly busy = signal(false);
}

describe('BannerReplaceDialogComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const q = <T extends HTMLElement>(id: string) => el.querySelector(`[data-testid="${id}"]`) as T | null;
    return {
      fixture,
      host: fixture.componentInstance,
      el,
      q,
      submit: () => q<HTMLButtonElement>('replace-submit')!,
      choose: (file: File | null) => {
        const input = q<HTMLInputElement>('replace-file')!;
        Object.defineProperty(input, 'files', { configurable: true, value: file ? { 0: file, length: 1, item: () => file } : { length: 0, item: () => null } });
        input.dispatchEvent(new Event('change'));
        fixture.detectChanges();
      },
      rename: (value: string) => {
        const input = q<HTMLInputElement>('replace-name')!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
    };
  }

  const png = (size = 10) => new File([new Uint8Array(size)], 'new.png', { type: 'image/png' });

  it('starts with the current name filled in and nothing to submit', () => {
    const { q, submit } = setup();

    expect(q<HTMLInputElement>('replace-name')!.value).toBe('1_az');
    expect(q<HTMLInputElement>('replace-file')!.accept).toBe('image/png');
    expect(submit().disabled).toBe(true);
  });

  it('enables Replace once a valid PNG is chosen and submits just the file when the name is unchanged', () => {
    const { host, choose, submit, q } = setup();
    const file = png();

    choose(file);
    expect(q('replace-problem')).toBeNull();
    expect(submit().disabled).toBe(false);
    submit().click();

    expect(host.submits).toHaveLength(1);
    expect(host.submits[0].file).toBe(file);
    expect('figmaImageName' in host.submits[0]).toBe(false);
  });

  it('also reports the new name when it was changed (trimmed)', () => {
    const { host, choose, rename, submit } = setup();

    choose(png());
    rename('  2_az  ');
    submit().click();

    expect(host.submits[0].figmaImageName).toBe('2_az');
  });

  it('treats a name that is only changed back, or only whitespace-padded, as unchanged', () => {
    const { host, choose, rename, submit } = setup();

    choose(png());
    rename(' 1_az ');
    submit().click();

    expect('figmaImageName' in host.submits[0]).toBe(false);
  });

  it('blocks a blank name', () => {
    const { choose, rename, submit, q } = setup();

    choose(png());
    rename('   ');

    expect(q('replace-name-blank')).not.toBeNull();
    expect(submit().disabled).toBe(true);
  });

  it('rejects a non-PNG file with a message and keeps Replace disabled', () => {
    const { choose, submit, q } = setup();

    choose(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));

    expect(q('replace-problem')?.textContent).toContain('banners.replace.problem.type');
    expect(submit().disabled).toBe(true);
  });

  it('rejects a file over 10 MB', () => {
    const { choose, submit, q } = setup();
    const big = png();
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });

    choose(big);

    expect(q('replace-problem')?.textContent).toContain('banners.replace.problem.size');
    expect(submit().disabled).toBe(true);
  });

  it('clears the problem when the choice is cleared or replaced by a valid file', () => {
    const { choose, submit, q } = setup();

    choose(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    choose(png());

    expect(q('replace-problem')).toBeNull();
    expect(submit().disabled).toBe(false);
    choose(null);
    expect(submit().disabled).toBe(true);
  });

  it('is locked while busy: nothing can be submitted or cancelled', () => {
    const { fixture, host, choose, submit, q } = setup();
    choose(png());

    host.busy.set(true);
    fixture.detectChanges();

    expect(submit().disabled).toBe(true);
    expect(q<HTMLButtonElement>('replace-cancel')!.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.cancels).toBe(0);
  });

  it('cancels with the button, Escape and a click on the backdrop', () => {
    const { host, q, el, fixture } = setup();

    q<HTMLButtonElement>('replace-cancel')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector('.backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();

    expect(host.cancels).toBe(3);
  });
});
