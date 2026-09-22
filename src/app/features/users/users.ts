import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AppUser, UserRole } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

@Component({
  selector: 'app-users',
  imports: [RouterLink, TranslatePipe, EmptyStateComponent, SpinnerComponent],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class UsersComponent implements OnInit {
  protected readonly usersService = inject(UsersService);
  protected readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  protected roleBadgeClass(role: UserRole): string {
    return role === 'admin' ? 'status-badge status-badge--admin' : 'status-badge status-badge--neutral';
  }

  ngOnInit(): void {
    this.usersService.loadUsers();
  }

  protected deleteUser(user: AppUser): void {
    if (!this.authService.isAdmin()) {
      return;
    }

    const message = this.translate.instant('users.deleteConfirm', { name: user.username });
    if (confirm(message)) {
      this.usersService.deleteUser(user.id, () => {
        this.toast.success(this.translate.instant('users.toast.deleted'));
      });
    }
  }
}
