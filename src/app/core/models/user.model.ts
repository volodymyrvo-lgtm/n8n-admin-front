/**
 * `reader` only looks at the documents (rule sets, prompts, glossaries);
 * `analyst` only sees the dashboard - see access.ts.
 */
export type UserRole = 'admin' | 'user' | 'reader' | 'analyst';

export const USER_ROLES: readonly UserRole[] = ['admin', 'user', 'reader', 'analyst'];

export interface AppUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface CreateUserInput {
  username: string;
  role: UserRole;
  password: string;
}
