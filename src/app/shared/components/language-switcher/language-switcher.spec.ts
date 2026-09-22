import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { LanguageSwitcherComponent } from './language-switcher';

describe('LanguageSwitcherComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render an option per available language', () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('.language-switcher__option');
    expect(buttons.length).toBe(2);
  });
});
