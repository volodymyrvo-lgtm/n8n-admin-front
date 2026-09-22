import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../../core/services/toast.service';
import { ToastContainerComponent } from './toast-container';

describe('ToastContainerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
    }).compileComponents();
  });

  it('renders nothing when there are no toasts', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.toast').length).toBe(0);
  });

  it('renders one element per toast, styled by type', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    const toastService = TestBed.inject(ToastService);
    toastService.success('Saved');
    toastService.error('Failed');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toasts = el.querySelectorAll('.toast');
    expect(toasts.length).toBe(2);
    expect(toasts[0].classList).toContain('toast--success');
    expect(toasts[0].textContent).toContain('Saved');
    expect(toasts[1].classList).toContain('toast--error');
    expect(toasts[1].textContent).toContain('Failed');
  });

  it('dismisses a toast when its close button is clicked', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    const toastService = TestBed.inject(ToastService);
    toastService.success('Saved');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.toast__close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.toast').length).toBe(0);
    expect(toastService.toasts().length).toBe(0);
  });
});
