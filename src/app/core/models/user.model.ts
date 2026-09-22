export type UserRole = 'admin' | 'user';

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
