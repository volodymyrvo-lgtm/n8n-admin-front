import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  allFolderRows,
  buildFolderTree,
  CUSTOMER_FOLDER_NAME_MAX_LENGTH,
  CustomerFolder,
  folderPath,
  visibleFolderRows,
} from '../../../../core/models/customer-folder.model';
import { AuthService } from '../../../../core/services/auth.service';
import { CustomerFoldersService } from '../../../../core/services/customer-folders.service';
import { ToastService } from '../../../../core/services/toast.service';
import { SpinnerComponent } from '../../../../shared/components/spinner/spinner';

/**
 * The customer's folders (`GET /customer-folders`) as a nested tree beside
 * the banner gallery. Clicking a folder chooses it as the destination folder
 * (`selectedChange`; clicking it again clears the choice) - the parent owns
 * what is chosen, this panel only shows it. Admins can also create a folder
 * (`POST /customer-folders`), by default inside the chosen one.
 */
@Component({
  selector: 'app-banner-folders',
  imports: [TranslatePipe, SpinnerComponent],
  templateUrl: './banner-folders.html',
  styleUrl: './banner-folders.css',
})
export class BannerFoldersComponent {
  protected readonly foldersService = inject(CustomerFoldersService);
  protected readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  /** The id of the chosen destination folder, `null` for none. */
  readonly selectedId = input<number | null>(null);
  readonly selectedChange = output<number | null>();

  protected readonly nameMaxLength = CUSTOMER_FOLDER_NAME_MAX_LENGTH;

  private readonly expandedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly creatingFolder = signal(false);
  protected readonly newName = signal('');
  /** Where the new folder goes: `null` is the top level. */
  protected readonly newParentId = signal<number | null>(null);

  private readonly tree = computed(() => buildFolderTree(this.foldersService.folders()));
  protected readonly rows = computed(() => visibleFolderRows(this.tree(), this.expandedIds()));
  protected readonly parentOptions = computed(() => allFolderRows(this.tree()));
  /** From the top level down to the chosen folder - empty when nothing (or an unknown id) is chosen. */
  protected readonly selectedPath = computed(() => folderPath(this.selectedId(), this.foldersService.folders()));
  protected readonly selectedFolder = computed<CustomerFolder | null>(() => this.selectedPath().at(-1) ?? null);
  protected readonly canSubmit = computed(() => this.newName().trim().length > 0 && !this.foldersService.creating());

  constructor() {
    this.foldersService.load();

    // Whatever is chosen (also from the URL) must be visible: open every folder above it.
    effect(() => {
      const ancestors = this.selectedPath().slice(0, -1).map((folder) => folder.id);
      const expanded = untracked(() => this.expandedIds());
      if (ancestors.some((id) => !expanded.has(id))) {
        this.expandedIds.set(new Set([...expanded, ...ancestors]));
      }
    });
  }

  protected reload(): void {
    this.foldersService.load();
  }

  protected select(id: number): void {
    this.selectedChange.emit(this.selectedId() === id ? null : id);
  }

  protected clearSelection(): void {
    this.selectedChange.emit(null);
  }

  protected toggleExpanded(id: number): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected openCreateForm(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.newName.set('');
    this.newParentId.set(this.selectedFolder()?.id ?? null);
    this.creatingFolder.set(true);
  }

  protected closeCreateForm(): void {
    this.creatingFolder.set(false);
  }

  protected onParentChange(value: string): void {
    this.newParentId.set(value === '' ? null : Number(value));
  }

  protected createFolder(): void {
    // Defense in depth - the form is only rendered for admins, and the backend answers 403 to anyone else.
    if (!this.authService.isAdmin() || !this.canSubmit()) {
      return;
    }
    const parentId = this.newParentId();
    this.foldersService.create(this.newName(), parentId, {
      onSuccess: (created) => {
        this.creatingFolder.set(false);
        if (parentId !== null) {
          this.expandedIds.update((ids) => new Set(ids).add(parentId));
        }
        this.toast.success(this.translate.instant('banners.folders.toast.created', { name: created.name }));
        this.selectedChange.emit(created.id);
      },
      // The error toast already says why (a duplicate name, a missing parent...); the form stays open to fix it.
      onError: () => undefined,
    });
  }

  protected indent(depth: number): string {
    return `${depth * 16}px`;
  }

  /** Option label of the parent picker: indented to show nesting (non-breaking spaces survive in `<option>`). */
  protected optionLabel(name: string, depth: number): string {
    return `${'   '.repeat(depth)}${name}`;
  }
}
