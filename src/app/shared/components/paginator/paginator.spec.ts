import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PaginatorComponent } from './paginator';

describe('PaginatorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginatorComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
  });

  it('renders nothing when there is only one page', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.paginator')).toBeNull();
  });

  it('shows the label and disables prev on the first page', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const buttons = el.querySelectorAll('button');
    expect(el.querySelector('.paginator__label')).toBeTruthy();
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables next on the last page', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 3);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const buttons = el.querySelectorAll('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits the next page number when the next button is clicked', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 5);
    fixture.detectChanges();

    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelectorAll('button')[1] as HTMLButtonElement).click();

    expect(emitted).toEqual([3]);
  });

  it('emits the previous page number when the previous button is clicked', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 5);
    fixture.detectChanges();

    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelectorAll('button')[0] as HTMLButtonElement).click();

    expect(emitted).toEqual([1]);
  });

  it('does not emit past the first or last page', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 2);
    fixture.detectChanges();

    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));

    const el = fixture.nativeElement as HTMLElement;
    const buttons = el.querySelectorAll('button');
    (buttons[0] as HTMLButtonElement).click();

    expect(emitted).toEqual([]);
  });
});
