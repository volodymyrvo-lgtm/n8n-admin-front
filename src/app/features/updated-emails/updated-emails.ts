import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { UpdatedEmail, UpdatedEmailListItem } from '../../core/models/updated-email.model';
import { UpdatedEmailsService } from '../../core/services/updated-emails.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';
import { ViewButtonComponent } from '../../shared/components/view-button/view-button';
import { ViewModalComponent } from '../../shared/components/view-modal/view-modal';

/**
 * The emails updated by the "email HTML update" jobs. Opening one fetches
 * its HTML (`GET /updated-emails/:id`) and shows it in a modal, inside a
 * sandboxed iframe: the HTML is somebody else's markup, so no scripts run
 * and its links open in a new tab instead of replacing the preview.
 */
@Component({
  selector: 'app-updated-emails',
  imports: [DatePipe, TranslatePipe, EmptyStateComponent, PaginatorComponent, SpinnerComponent, ViewButtonComponent, ViewModalComponent],
  templateUrl: './updated-emails.html',
  styleUrl: './updated-emails.css',
})
export class UpdatedEmailsComponent implements OnInit, OnDestroy {
  protected readonly emailsService = inject(UpdatedEmailsService);

  /** The row whose modal is open. */
  protected readonly viewed = signal<UpdatedEmailListItem | null>(null);
  /** Its HTML once loaded. */
  protected readonly viewedEmail = signal<UpdatedEmail | null>(null);
  protected readonly viewLoading = signal(false);
  protected readonly viewFailed = signal(false);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.emailsService.total() / this.emailsService.limit())),
  );

  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('preview');
  private request: Subscription | null = null;

  constructor() {
    // Put the email into the iframe. Set as a property, not bound in the template: Angular would sanitize a bound `srcdoc` and mangle the email.
    effect(() => {
      const frame = this.frame()?.nativeElement;
      const body = this.viewedEmail()?.body;
      if (frame && body !== undefined) {
        // With no `allow-popups` in the sandbox a `_blank` link simply does nothing - the preview is never navigated away.
        frame.srcdoc = body.includes('<head>') ? body.replace('<head>', '<head><base target="_blank">') : `<base target="_blank">${body}`;
      }
    });
  }

  ngOnInit(): void {
    this.refresh(1);
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  protected refresh(page: number): void {
    this.emailsService.loadEmails({ page });
  }

  protected open(item: UpdatedEmailListItem): void {
    this.request?.unsubscribe();
    this.viewed.set(item);
    this.viewedEmail.set(null);
    this.viewFailed.set(false);
    this.viewLoading.set(true);
    this.request = this.emailsService.getEmail(item.id).subscribe({
      next: (email) => {
        this.viewedEmail.set(email);
        this.viewLoading.set(false);
      },
      error: () => {
        this.viewFailed.set(true);
        this.viewLoading.set(false);
      },
    });
  }

  protected retry(): void {
    const item = this.viewed();
    if (item) {
      this.open(item);
    }
  }

  protected close(): void {
    this.request?.unsubscribe();
    this.viewed.set(null);
    this.viewedEmail.set(null);
    this.viewLoading.set(false);
    this.viewFailed.set(false);
  }
}
