import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from './confirm-dialog';

@Component({
  imports: [ConfirmDialogComponent],
  template: `
    <app-confirm-dialog
      title="Delete all?"
      message="Gone forever."
      confirmLabel="Delete"
      cancelLabel="Keep"
      [requiredText]="word()"
      [busy]="busy()"
      [tone]="tone()"
      (confirmed)="confirms = confirms + 1"
      (cancelled)="cancels = cancels + 1"
    />
  `,
})
class HostComponent {
  confirms = 0;
  cancels = 0;
  readonly word = signal<string | null>('DELETE');
  readonly busy = signal(false);
  readonly tone = signal<'danger' | 'primary'>('danger');
}

describe('ConfirmDialogComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      host: fixture.componentInstance,
      el,
      confirm: () => el.querySelector('[data-testid="confirm"]') as HTMLButtonElement,
      cancel: () => el.querySelector('[data-testid="cancel"]') as HTMLButtonElement,
      input: () => el.querySelector('[data-testid="confirm-input"]') as HTMLInputElement,
      type: async (value: string) => {
        const input = el.querySelector('[data-testid="confirm-input"]') as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('shows the title, message and labels as an alert dialog', () => {
    const { el } = setup();
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(el.textContent).toContain('Delete all?');
    expect(el.textContent).toContain('Gone forever.');
  });

  it('keeps confirm disabled until the required word is typed exactly', async () => {
    const { fixture, host, confirm, type } = setup();
    expect(confirm().disabled).toBe(true);

    await type('delete');
    expect(confirm().disabled).toBe(true);

    await type(' DELETE ');
    expect(confirm().disabled).toBe(false);

    confirm().click();
    fixture.detectChanges();
    expect(host.confirms).toBe(1);
  });

  it('confirms straight away when no word is required', () => {
    const { fixture, host, confirm, input } = setup();
    host.word.set(null);
    fixture.detectChanges();

    expect(input()).toBeNull();
    expect(confirm().disabled).toBe(false);
  });

  it('cancels on the cancel button, Escape and a backdrop press, but not on a press inside the panel', () => {
    const { fixture, host, el, cancel } = setup();

    cancel().click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector('.backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.querySelector('.panel')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();

    expect(host.cancels).toBe(3);
  });

  it('while busy it can neither be dismissed nor confirmed', async () => {
    const { fixture, host, confirm, cancel, type } = setup();
    await type('DELETE');
    host.busy.set(true);
    fixture.detectChanges();

    expect(confirm().disabled).toBe(true);
    expect(cancel().disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.cancels).toBe(0);
    expect(host.confirms).toBe(0);
  });

  it('styles the confirm button as destructive by default and as a plain action with tone="primary"', () => {
    const { fixture, host, confirm } = setup();
    expect(confirm().classList).toContain('panel__btn--danger');

    host.tone.set('primary');
    fixture.detectChanges();
    expect(confirm().classList).not.toContain('panel__btn--danger');
    expect(confirm().classList).toContain('panel__btn--primary');
  });
});
