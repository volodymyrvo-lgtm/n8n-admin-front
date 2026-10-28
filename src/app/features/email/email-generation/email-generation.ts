import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import {
  defaultEmailValues,
  EmailTemplateField,
  EmailTemplateGroup,
  EmailTemplateListItem,
  EmailTemplateManifest,
  EmailTemplateValues,
  isSafeUrl,
  moveItem,
  newGroupItem,
  renderEmailTemplate,
} from '../../../core/models/email-template.model';
import { EmailTemplatesService } from '../../../core/services/email-templates.service';
import { MjmlCompileResult, MjmlCompilerService } from '../../../core/services/mjml-compiler.service';
import { CodeEditorComponent } from '../../../shared/components/code-editor/code-editor';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

type Tab = 'fields' | 'mjml';
type Device = 'desktop' | 'mobile';

/** How long to wait after the last change before compiling again. */
const COMPILE_DELAY_MS = 300;

/** The fields that follow each other with the same `section`, shown under one heading. */
interface FieldSection {
  kind: 'fields';
  title: string | null;
  fields: EmailTemplateField[];
}

/** One part of the form, top to bottom: a run of fields, or a repeatable group. */
type FormEntry = FieldSection | { kind: 'group'; group: EmailTemplateGroup };

/**
 * The Content Generation menu's "Email Generation" page: pick an email
 * template (MJML files shipped with the app, see `EmailTemplatesService`),
 * fill in its variables in the form - including repeatable blocks such as
 * the bonuses, added with a button and put in order by dragging - and watch
 * the compiled email on the right. The "MJML" tab edits the template's source itself; such edits live
 * in this page only (they don't change the file) and "Reset template"
 * brings the original back. The preview is only a preview for now: nothing
 * is sent or saved.
 *
 * The email is shown in a sandboxed iframe (no scripts, nothing from the
 * page leaks in), and a compile that fails keeps the last good picture.
 */
@Component({
  selector: 'app-email-generation',
  imports: [TranslatePipe, EmptyStateComponent, SpinnerComponent, CodeEditorComponent, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './email-generation.html',
  styleUrl: './email-generation.css',
})
export class EmailGenerationComponent implements OnDestroy {
  private readonly templatesService = inject(EmailTemplatesService);
  private readonly compiler = inject(MjmlCompilerService);

  protected readonly templates = signal<EmailTemplateListItem[]>([]);
  protected readonly listLoading = signal(true);
  protected readonly listFailed = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly templateLoading = signal(false);
  protected readonly templateFailed = signal(false);

  protected readonly manifest = signal<EmailTemplateManifest | null>(null);
  /** The template as shipped, and as edited on the MJML tab. */
  private readonly originalSource = signal('');
  protected readonly source = signal('');
  protected readonly values = signal<EmailTemplateValues>({ fields: {}, groups: {} });

  protected readonly tab = signal<Tab>('fields');
  protected readonly device = signal<Device>('desktop');
  protected readonly compiled = signal<MjmlCompileResult | null>(null);
  protected readonly compiling = signal(false);

  protected readonly sourceChanged = computed(() => this.source() !== this.originalSource());

  private readonly rendered = computed(() => {
    const manifest = this.manifest();
    return manifest ? renderEmailTemplate(this.source(), manifest, this.values()) : null;
  });
  protected readonly unknownVariables = computed(() => this.rendered()?.unknown ?? []);

  /** The form top to bottom: the fields in the manifest's order, with each group right after the field it names (`after`). */
  protected readonly entries = computed<FormEntry[]>(() => {
    const manifest = this.manifest();
    const groups = manifest?.groups ?? [];
    const fieldKeys = new Set(manifest?.fields.map((field) => field.key));
    const entries: FormEntry[] = [];
    let lastTitle: string | null = null;
    for (const field of manifest?.fields ?? []) {
      const title = field.section ?? null;
      const last = entries.at(-1);
      if (last?.kind === 'fields' && last.title === title) {
        last.fields.push(field);
      } else {
        // The fields of a section that a group has split carry on without repeating its heading.
        entries.push({ kind: 'fields', title: title !== null && title === lastTitle ? null : title, fields: [field] });
      }
      lastTitle = title;
      for (const group of groups.filter((candidate) => candidate.after === field.key)) {
        entries.push({ kind: 'group', group });
      }
    }
    // A group that doesn't name a field (or names one that doesn't exist) goes last.
    for (const group of groups.filter((candidate) => !candidate.after || !fieldKeys.has(candidate.after))) {
      entries.push({ kind: 'group', group });
    }
    return entries;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('preview');
  private loadRequest: Subscription | null = null;
  private compileRun = 0;

  constructor() {
    this.templatesService.list().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.listLoading.set(false);
        if (templates.length > 0) {
          this.selectTemplate(templates[0].id);
        }
      },
      error: () => {
        this.listFailed.set(true);
        this.listLoading.set(false);
      },
    });

    // Compile shortly after the last change; an older compile that finishes late is ignored.
    effect((onCleanup) => {
      const rendered = this.rendered();
      if (!rendered) {
        return;
      }
      const run = ++this.compileRun;
      this.compiling.set(true);
      const timer = setTimeout(async () => {
        const result = await this.compiler.compile(rendered.mjml);
        if (run === this.compileRun) {
          this.compiled.set(result);
          this.compiling.set(false);
        }
      }, COMPILE_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // Put the compiled email into the iframe. Set as a property, not bound in the template: Angular would sanitize a bound `srcdoc` and mangle the email.
    effect(() => {
      const frame = this.frame()?.nativeElement;
      const html = this.compiled()?.html;
      if (frame && html) {
        // Links must not take the preview away: with no `allow-popups` in the sandbox, `_blank` simply does nothing.
        frame.srcdoc = html.replace('<head>', '<head><base target="_blank">');
      }
    });
  }

  ngOnDestroy(): void {
    this.loadRequest?.unsubscribe();
  }

  protected selectTemplate(id: string): void {
    this.loadRequest?.unsubscribe();
    this.selectedId.set(id);
    this.templateLoading.set(true);
    this.templateFailed.set(false);
    this.manifest.set(null);
    this.compiled.set(null);

    this.loadRequest = this.templatesService.load(id).subscribe({
      next: ({ manifest, source }) => {
        this.originalSource.set(source);
        this.source.set(source);
        this.values.set(defaultEmailValues(manifest));
        this.manifest.set(manifest);
        this.tab.set('fields');
        this.templateLoading.set(false);
      },
      error: () => {
        this.templateFailed.set(true);
        this.templateLoading.set(false);
      },
    });
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected setDevice(device: Device): void {
    this.device.set(device);
  }

  protected setField(key: string, value: string): void {
    this.values.update((values) => ({ ...values, fields: { ...values.fields, [key]: value } }));
  }

  protected items(group: EmailTemplateGroup): Record<string, string>[] {
    return this.values().groups[group.key] ?? [];
  }

  protected setItemField(group: EmailTemplateGroup, index: number, key: string, value: string): void {
    this.values.update((values) => ({
      ...values,
      groups: {
        ...values.groups,
        [group.key]: this.items(group).map((item, i) => (i === index ? { ...item, [key]: value } : item)),
      },
    }));
  }

  protected canAdd(group: EmailTemplateGroup): boolean {
    return group.max === undefined || this.items(group).length < group.max;
  }

  protected canRemove(group: EmailTemplateGroup): boolean {
    return this.items(group).length > (group.min ?? 0);
  }

  protected addItem(group: EmailTemplateGroup): void {
    if (!this.canAdd(group)) {
      return;
    }
    this.values.update((values) => ({ ...values, groups: { ...values.groups, [group.key]: [...this.items(group), newGroupItem(group)] } }));
  }

  protected removeItem(group: EmailTemplateGroup, index: number): void {
    if (!this.canRemove(group)) {
      return;
    }
    this.values.update((values) => ({ ...values, groups: { ...values.groups, [group.key]: this.items(group).filter((_, i) => i !== index) } }));
  }

  /** Puts the item that was dragged from `previousIndex` at `currentIndex`. */
  protected dropItem(group: EmailTemplateGroup, event: Pick<CdkDragDrop<unknown>, 'previousIndex' | 'currentIndex'>): void {
    this.reorder(group, event.previousIndex, event.currentIndex);
  }

  /** Keyboard alternative to dragging: ArrowUp/ArrowDown on an item's handle moves it, and the handle keeps the focus. */
  protected moveBy(group: EmailTemplateGroup, index: number, delta: -1 | 1, event: Event): void {
    event.preventDefault();
    const target = index + delta;
    if (target < 0 || target >= this.items(group).length) {
      return;
    }
    this.reorder(group, index, target);
    afterNextRender(
      () => {
        const handles = this.host.nativeElement.querySelectorAll<HTMLElement>(`[data-testid="group-${group.key}"] [data-testid="drag-handle"]`);
        handles[target]?.focus();
      },
      { injector: this.injector },
    );
  }

  private reorder(group: EmailTemplateGroup, from: number, to: number): void {
    this.values.update((values) => ({ ...values, groups: { ...values.groups, [group.key]: moveItem(this.items(group), from, to) } }));
  }

  protected resetValues(): void {
    const manifest = this.manifest();
    if (manifest) {
      this.values.set(defaultEmailValues(manifest));
    }
  }

  protected resetSource(): void {
    this.source.set(this.originalSource());
  }

  /** A link the email can't carry (a `javascript:` one) is left out of it; the form says so. */
  protected badUrl(field: EmailTemplateField, value: string | undefined): boolean {
    return field.type === 'url' && !!value && !isSafeUrl(value);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
