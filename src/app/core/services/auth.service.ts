import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@env';
import { UserRole } from '../models/user.model';

const TOKEN_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'auth_user';

export interface LoginCredentials {
  username: string;
  password: string;
}

/** The logged-in user, as returned alongside the token on login. */
export interface CurrentUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
}

/**
 * Handles authentication state for the app: who is logged in, the
 * token that proves it, and that user's role (used to gate admin-only
 * actions like editing/deleting rule sets - see adminGuard and
 * RuleSetsComponent).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly loginUrl = `${environment.apiBaseUrl}/auth/login`;

  readonly isAuthenticated = signal<boolean>(this.hasValidStoredToken());
  readonly currentUser = signal<CurrentUser | null>(this.isAuthenticated() ? this.getStoredUser() : null);

  public login(credentials: LoginCredentials): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(this.loginUrl, credentials)
      .pipe(tap((response) => this.storeSession(response.accessToken, response.user)));
  }

  public logout(): void {
    this.clearStoredSession();
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
  }

  public getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** True when the current user's role is 'admin'. False while logged out. */
  public isAdmin(): boolean {
    return this.currentUser()?.role === 'admin';
  }

  /**
   * Re-checks the stored token's expiry and syncs `isAuthenticated` /
   * `currentUser` to match, clearing an expired session along the way.
   * The auth/guest guards call this on every navigation, so a token
   * that expired while the app was sitting open on a page is still
   * caught - not just the one checked at app startup.
   */
  public checkSession(): boolean {
    const valid = this.hasValidStoredToken();
    if (this.isAuthenticated() !== valid) {
      this.isAuthenticated.set(valid);
      this.currentUser.set(valid ? this.getStoredUser() : null);
    }
    return valid;
  }

  private storeSession(token: string, user: CurrentUser): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // localStorage may be unavailable (e.g. private browsing) - ignore.
    }
    this.isAuthenticated.set(true);
    this.currentUser.set(user);
  }

  private clearStoredSession(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (e.g. private browsing) - ignore.
    }
  }

  private getStoredUser(): CurrentUser | null {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CurrentUser) : null;
    } catch {
      return null;
    }
  }

  /** True when a token is stored and, if it's a decodable JWT, not yet expired. */
  private hasValidStoredToken(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }
    if (this.isTokenExpired(token)) {
      this.clearStoredSession();
      return false;
    }
    return true;
  }

  /**
   * Decodes a JWT's payload and checks its `exp` claim against the
   * current time. A token that isn't a decodable JWT, or has no `exp`
   * claim, is treated as not expired here - there is nothing to check
   * client-side, but a genuinely invalid/expired token still gets
   * caught server-side (see authExpiryInterceptor, which reacts to a
   * 401 from the backend instead).
   */
  private isTokenExpired(token: string): boolean {
    const expiresAt = this.decodeTokenExpiry(token);
    return expiresAt !== null && Date.now() >= expiresAt;
  }

  private decodeTokenExpiry(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return null;
      }
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64);
      const decoded = JSON.parse(json) as { exp?: number };
      return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }
}
