import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { createRow, KeyValueEditorComponent, KeyValueRow } from './key-value-editor';

@Component({
  selector: 'app-host',
  imports: [KeyValueEditorComponent],
  template: `<app-key-value-editor [(rows)]="rows" />`,
})
class HostComponent {
  rows: KeyValueRow[] = [];
}

describe('KeyValueEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
  });

  it('starts empty and adds a flat field row', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const addFieldBtn = Array.from(el.querySelectorAll('.kv-add'))[0] as HTMLButtonElement;
    addFieldBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.rows.length).toBe(1);
    expect(fixture.componentInstance.rows[0].isGroup).toBe(false);
    expect(el.querySelectorAll('.kv-input--value').length).toBe(1);
  });

  it('adds a group row that renders a nested editor instead of a value input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const addGroupBtn = Array.from(el.querySelectorAll('.kv-add'))[1] as HTMLButtonElement;
    addGroupBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.rows[0].isGroup).toBe(true);
    expect(el.querySelector('.kv-group-badge')).toBeTruthy();
    expect(el.querySelectorAll('app-key-value-editor').length).toBe(2); // host + nested
  });

  it('can add fields arbitrarily deep inside a nested group', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows = [createRow({ isGroup: true })];
    fixture.detectChanges();

    // The nested editor for the group row renders inside that row, before
    // this (outer) level's own "+ Add field" / "+ Add group" actions - so
    // the nested editor's buttons come first in document order.
    const el = fixture.nativeElement as HTMLElement;
    const nestedAddField = el.querySelector('.kv-nested .kv-add') as HTMLButtonElement;
    nestedAddField.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.rows[0].children.length).toBe(1);
  });

  it('removes a row', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows = [createRow({ key: 'Segment', value: 'Deposit Count = 0' })];
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.kv-remove') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.rows.length).toBe(0);
  });
});
