import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a success toast', () => {
    const service = TestBed.inject(ToastService);
    service.success('Saved');

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].type).toBe('success');
    expect(service.toasts()[0].message).toBe('Saved');
  });

  it('adds an error toast', () => {
    const service = TestBed.inject(ToastService);
    service.error('Something failed');

    expect(service.toasts()[0].type).toBe('error');
  });

  it('assigns each toast a unique, increasing id', () => {
    const service = TestBed.inject(ToastService);
    service.success('First');
    service.success('Second');

    const [first, second] = service.toasts();
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('auto-dismisses a success toast after its duration', () => {
    const service = TestBed.inject(ToastService);
    service.success('Saved');
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(4000);

    expect(service.toasts().length).toBe(0);
  });

  it('keeps an error toast visible longer than a success toast', () => {
    const service = TestBed.inject(ToastService);
    service.error('Failed');

    vi.advanceTimersByTime(4000);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(2000);
    expect(service.toasts().length).toBe(0);
  });

  it('dismiss() removes a toast immediately', () => {
    const service = TestBed.inject(ToastService);
    service.success('Saved');
    const id = service.toasts()[0].id;

    service.dismiss(id);

    expect(service.toasts().length).toBe(0);
  });
});
