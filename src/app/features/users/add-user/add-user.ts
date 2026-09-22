import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UserRole } from '../../../core/models/user.model';
import { UsersService } from '../../../core/services/users.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-add-user',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './add-user.html',
  styleUrl: './add-user.css',
})
export class AddUserComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    role: this.fb.nonNullable.control<UserRole>('user', Validators.required),
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { username, role, password } = this.form.getRawValue();
    this.usersService.addUser({ username, role, password });
    this.toast.success(this.translate.instant('users.toast.created'));
    this.router.navigateByUrl('/users');
  }
}
