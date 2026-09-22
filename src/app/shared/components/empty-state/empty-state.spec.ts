import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state';

describe('EmptyStateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();
  });

  it('renders the given title and description', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', 'Nothing here yet');
    fixture.componentRef.setInput('description', 'Come back later.');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state__title')?.textContent).toBe('Nothing here yet');
    expect(el.querySelector('.empty-state__description')?.textContent).toBe('Come back later.');
  });

  it('omits the description element when none is given', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', 'Nothing here yet');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state__description')).toBeNull();
  });
});
