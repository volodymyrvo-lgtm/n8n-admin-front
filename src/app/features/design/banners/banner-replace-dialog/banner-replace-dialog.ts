import { AfterViewInit, Component, computed, ElementRef, HostListener, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Banner, BannerImageProblem, bannerImageProblem, formatFileSize } from '../../../../core/models/banner.model';

/** What the dialog hands back: the new picture, and the new name only when it differs from the current one. */
export interface BannerReplacement {
  file: File;
  figmaImageName?: string;
}

/**
 * "Replace" dialog of one banner: pick a new PNG (up to 10 MB, checked here
 * before anything is uploaded) and optionally rename the banner. The picture
 * is required; the name is only reported back (`submitted.figmaImageName`)
 * when it was actually changed.
 *
 * Presentational like the confirm dialog: the parent uploads on `submitted`,
 * sets `busy` meanwhile and closes it when done (it stays open on a failure,
 * so the same file can be retried).
 */
@Component({
  selector: 'app-banner-replace-dialog',
  imports: [TranslatePipe],
  templateUrl: './banner-replace-dialog.html',
  styleUrl: './banner-replace-dialog.css',
})
export class BannerReplaceDialogComponent implements AfterViewInit, OnDestroy {
  readonly banner = input.required<Banner>();
  readonly busy = input<boolean>(false);

  readonly submitted = output<BannerReplacement>();
  readonly cancelled = output<void>();

  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal<BannerImageProblem | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  /** The name field; `null` until it is touched, so it follows the banner's current name. */
  private readonly editedName = signal<string | null>(null);
  protected readonly name = computed(() => this.editedName() ?? this.banner().figmaImageName);

  protected readonly nameBlank = computed(() => this.name().trim().length === 0);
  protected readonly canSubmit = computed(() => this.file() !== null && this.problem() === null && !this.nameBlank() && !this.busy());

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  ngAfterViewInit(): void {
    this.fileInput()?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cancel();
  }

  protected onBackdropMouseDown(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  protected onFileChange(event: Event): void {
    const chosen = (event.target as HTMLInputElement).files?.item(0) ?? null;
    this.revokePreview();
    this.file.set(chosen);
    this.problem.set(chosen ? bannerImageProblem(chosen) : null);
    if (chosen && !this.problem() && typeof URL.createObjectURL === 'function') {
      this.previewUrl.set(URL.createObjectURL(chosen));
    }
  }

  protected onNameInput(event: Event): void {
    this.editedName.set((event.target as HTMLInputElement).value);
  }

  protected fileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  protected cancel(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }

  protected submit(): void {
    const file = this.file();
    if (!file || !this.canSubmit()) {
      return;
    }
    const name = this.name().trim();
    this.submitted.emit(name !== this.banner().figmaImageName ? { file, figmaImageName: name } : { file });
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    this.previewUrl.set(null);
  }
}
