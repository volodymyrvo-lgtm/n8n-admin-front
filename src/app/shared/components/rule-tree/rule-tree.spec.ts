import { TestBed } from '@angular/core/testing';
import { RuleSetFields } from '../../../core/models/rule-set.model';
import { RuleTreeComponent } from './rule-tree';

describe('RuleTreeComponent', () => {
  it('renders flat fields as key/value pairs and nested objects as indented sub-trees', () => {
    const fixture = TestBed.createComponent(RuleTreeComponent);
    const fields: RuleSetFields = {
      Segment: 'Deposit Count = 0',
      'Bonus Block': { 'bonus 1': { 'Min Deposit': '10' }, Note: 'x' },
    };
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const keys = Array.from(el.querySelectorAll('.tree__key')).map((n) => n.textContent?.trim());
    expect(keys).toEqual(['Segment', 'Bonus Block', 'bonus 1', 'Min Deposit', 'Note']);
    expect(el.querySelectorAll('.tree .tree').length).toBe(2);
    expect(el.textContent).toContain('Deposit Count = 0');
    expect(el.querySelector('.tree__key--group')?.textContent?.trim()).toBe('Bonus Block');
  });
});
