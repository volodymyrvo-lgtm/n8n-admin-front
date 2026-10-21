import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { ViewModalComponent } from './view-modal';

@Component({
  imports: [ViewModalComponent],
  template: `
    <app-view-modal title="Welcome" subtitle="en_az" [copyText]="copyText()" (closed)="closes = closes + 1">
      <p class="projected">Hello body</p>
    </app-view-modal>
  `,
})
class HostComponent {
  closes = 0;
  readonly copyText = signal<string | null>(null);
}

describe('ViewModalComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the title, subtitle and projected body as an accessible dialog', () => {
    const el: HTMLElement = setup().nativeElement;

    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector('.panel__title')?.textContent).toContain('Welcome');
    expect(el.querySelector('.panel__subtitle')?.textContent).toContain('en_az');
    expect(el.querySelector('.projected')?.textContent).toBe('Hello body');
  });

  it('closes on the X button, on a backdrop press and on Escape - but not on a press inside the panel', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;

    (el.querySelector('[data-testid="close"]') as HTMLButtonElement).click();
    expect(fixture.componentInstance.closes).toBe(1);

    el.querySelector('.backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixture.componentInstance.closes).toBe(2);

    el.querySelector('.panel')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixture.componentInstance.closes).toBe(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.closes).toBe(3);
  });

  it('moves focus to the close button when it opens', () => {
    const el: HTMLElement = setup().nativeElement;
    expect(document.activeElement).toBe(el.querySelector('[data-testid="close"]'));
  });

  it('offers "Copy" only when there is text to copy, and writes it to the clipboard', async () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="copy"]')).toBeNull();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fixture.componentInstance.copyText.set('the text');
    fixture.detectChanges();

    (el.querySelector('[data-testid="copy"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('the text');
    expect(el.querySelector('[data-testid="copy"]')?.textContent).toContain('common.copied');
  });
});
