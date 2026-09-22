import { TestBed } from '@angular/core/testing';
import { SpinnerComponent } from './spinner';

describe('SpinnerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpinnerComponent],
    }).compileComponents();
  });

  it('renders a spinner with the default size and no label', () => {
    const fixture = TestBed.createComponent(SpinnerComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const spinner = el.querySelector('.spinner') as HTMLElement;
    expect(spinner).toBeTruthy();
    expect(spinner.style.width).toBe('30px');
    expect(el.querySelector('.spinner-label')).toBeNull();
  });

  it('renders the label and uses it as the accessible name when provided', () => {
    const fixture = TestBed.createComponent(SpinnerComponent);
    fixture.componentRef.setInput('label', 'Loading...');
    fixture.componentRef.setInput('size', 48);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.spinner-label')?.textContent).toBe('Loading...');
    expect((el.querySelector('.spinner') as HTMLElement).style.width).toBe('48px');
    expect(el.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Loading...');
  });
});
