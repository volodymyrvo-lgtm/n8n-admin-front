import { UserRole } from './models/user.model';

/**
 * The parts of the app a role can open. Whatever a role may *change* is a
 * separate matter - that stays admin-only (see AuthService.isAdmin and the
 * admin guard); this is only about which screens a role can see at all.
 *
 * - `jobs`: the jobs lists and the "add job" forms (Content and SEO)
 * - `documents`: the rule sets, prompts and glossary lists, read through the "eye"
 * - `users`: the users list
 * - `dashboard`: the LLM spend dashboard
 * - `errors`: the job error logs
 * - `banners`: the design banners (the list; deleting them is admin-only on top of this)
 */
export type AccessArea = 'jobs' | 'documents' | 'users' | 'dashboard' | 'errors' | 'banners';

export const ROLE_AREAS: Record<UserRole, readonly AccessArea[]> = {
  admin: ['jobs', 'documents', 'users', 'dashboard', 'errors', 'banners'],
  user: ['jobs', 'documents', 'users', 'dashboard', 'errors', 'banners'],
  /** Looks at the documents (rule sets, prompts, glossaries), the error logs and the banners, nothing else. */
  reader: ['documents', 'errors', 'banners'],
  /** Sees the dashboard and nothing else. */
  analyst: ['dashboard'],
};

/** Roles come from the backend as plain strings - tolerate any casing, and treat an unknown role as having no access. */
export function areasOf(role: string | null | undefined): readonly AccessArea[] {
  return ROLE_AREAS[(role ?? '').toLowerCase() as UserRole] ?? [];
}

/** The page a role lands on when it opens somewhere it may not be: the first thing it can actually use. */
export function homeUrlOf(role: string | null | undefined): string {
  const areas = areasOf(role);
  if (areas.includes('jobs')) {
    return '/flows';
  }
  if (areas.includes('dashboard') && !areas.includes('documents')) {
    return '/usage';
  }
  if (areas.includes('documents')) {
    return '/rule-sets';
  }
  return '/flows';
}
