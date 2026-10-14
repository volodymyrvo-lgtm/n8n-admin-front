import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiSelectComponent } from './multi-select';

describe('MultiSelectComponent', () => {
  let fixture: ComponentFixture<MultiSelectComponent>;
  let toggled: string[];
  let cleared: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MultiSelectComponent] }).compileComponents();
    fixture = TestBed.createComponent(MultiSelectComponent);
    toggled = [];
    cleared = 0;
    fixture.componentInstance.toggled.subscribe((value) => toggled.push(value));
    fixture.componentInstance.cleared.subscribe(() => cleared++);

    fixture.componentRef.setInput('label', 'Model');
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    fixture.componentRef.setInput('selected', []);
    fixture.componentRef.setInput('clearLabel', 'Clear');
    fixture.detectChanges();
  });

  const button = () => fixture.nativeElement.querySelector('.ms__button') as HTMLButtonElement;
  const panel = () => fixture.nativeElement.querySelector('.ms__panel') as HTMLElement | null;

  it('is closed by default and opens a checklist on click', () => {
    expect(panel()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');

    button().click();
    fixture.detectChanges();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect([...fixture.nativeElement.querySelectorAll('.ms__option-label')].map((el: HTMLElement) => el.textContent)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('shows how many values are picked and lists them in the tooltip', () => {
    expect(fixture.nativeElement.querySelector('.ms__count')).toBeNull();

    fixture.componentRef.setInput('selected', ['b', 'a']);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ms__count').textContent.trim()).toBe('2');
    expect(button().title).toBe('Alpha, Beta');
    expect(button().classList).toContain('ms__button--active');
  });

  it('reports toggled values and checks the selected ones', () => {
    fixture.componentRef.setInput('selected', ['a']);
    button().click();
    fixture.detectChanges();

    const boxes = [...fixture.nativeElement.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);

    boxes[1].click();
    expect(toggled).toEqual(['b']);
  });

  it('offers "clear" only while something is selected', () => {
    button().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ms__clear')).toBeNull();

    fixture.componentRef.setInput('selected', ['a']);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.ms__clear') as HTMLButtonElement).click();
    expect(cleared).toBe(1);
  });

  it('closes on Escape and on a click outside', () => {
    button().click();
    fixture.detectChanges();
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();

    button().click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('can line its list up with the right edge of the button', () => {
    fixture.componentRef.setInput('panelAlign', 'end');
    button().click();
    fixture.detectChanges();

    expect(panel()?.classList).toContain('ms__panel--end');
  });

  it('stays open when clicking inside the list', () => {
    button().click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.ms__option') as HTMLElement).click();
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });
});
