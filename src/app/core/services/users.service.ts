import { inject, Injectable, signal } from '@angular/core';
import { AppUser, CreateUserInput } from '../models/user.model';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { environment } from '@env';
import { ToastService } from './toast.service';
import { TranslateService } from '@ngx-translate/core';
import { App } from '../../app';

const USERS_URL = `${environment.apiBaseUrl}/users`;

/**
 * In-memory user store.
 *
 * TODO: this starts empty - wire `loadUsers` up to the real backend
 * once the API exists.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  readonly users = signal<AppUser[]>([]);
  readonly loading = signal<boolean>(false);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);


  loadUsers(): void {
    this.loading.set(true);
    this.http
      .get<AppUser[]>(USERS_URL)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((users) => {
        this.users.set(users);
      });
  }

  addUser(input: CreateUserInput): void {
    const user: CreateUserInput = {
      username: input.username,
      role: input.role,
      password: input.password,
    };
    this.http
      .post<AppUser>(USERS_URL, user)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((createdUser) => {
        this.users.update((currentUsers: AppUser[]): AppUser[] => [...currentUsers, createdUser]);
      });
  }

  deleteUser(id: string, onSuccess?: () => void): void {
    this.http.delete(`${USERS_URL}/${id}`).subscribe(() => {
      this.users.update((currentUsers) => currentUsers.filter((user) => user.id !== id));
      onSuccess?.();
    });
  }
}
