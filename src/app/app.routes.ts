import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    // Everything under this empty-path parent requires an authenticated
    // user - add future protected pages as children of the dashboard
    // layout below and they inherit the guard automatically.
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./layout/dashboard-layout/dashboard-layout').then((m) => m.DashboardLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'jobs' },
          {
            path: 'jobs',
            loadComponent: () => import('./features/jobs/job-list/job-list').then((m) => m.JobListComponent),
          },
          {
            path: 'jobs/new',
            loadComponent: () => import('./features/jobs/add-job/add-job').then((m) => m.AddJobComponent),
          },
          {
            path: 'rule-sets',
            loadComponent: () => import('./features/rule-sets/rule-sets').then((m) => m.RuleSetsComponent),
          },
          {
            path: 'rule-sets/new',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/rule-sets/rule-set-form/rule-set-form').then((m) => m.RuleSetFormComponent),
          },
          {
            path: 'rule-sets/:id/edit',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/rule-sets/rule-set-form/rule-set-form').then((m) => m.RuleSetFormComponent),
          },
          {
            path: 'users',
            loadComponent: () => import('./features/users/users').then((m) => m.UsersComponent),
          },
          {
            path: 'users/new',
            canActivate: [adminGuard],
            loadComponent: () => import('./features/users/add-user/add-user').then((m) => m.AddUserComponent),
          },
          {
            path: 'prompts',
            loadComponent: () => import('./features/prompts/prompts').then((m) => m.PromptsComponent),
          },
          {
            path: 'prompts/new',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/prompts/prompt-form/prompt-form').then((m) => m.PromptFormComponent),
          },
          {
            path: 'prompts/:id/edit',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/prompts/prompt-form/prompt-form').then((m) => m.PromptFormComponent),
          },
          {
            path: 'glossary',
            loadComponent: () =>
              import('./features/glossary/glossary-list/glossary-list').then((m) => m.GlossaryListComponent),
          },
          {
            path: 'glossary/new',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/glossary/glossary-form/glossary-form').then((m) => m.GlossaryFormComponent),
          },
          {
            path: 'glossary/:id/edit',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/glossary/glossary-form/glossary-form').then((m) => m.GlossaryFormComponent),
          },
          {
            path: 'glossary/:id',
            loadComponent: () =>
              import('./features/glossary/glossary-entries-list/glossary-entries-list').then(
                (m) => m.GlossaryEntriesListComponent,
              ),
          },
          {
            path: 'glossary/:id/entries/new',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/glossary/glossary-entry-form/glossary-entry-form').then(
                (m) => m.GlossaryEntryFormComponent,
              ),
          },
          {
            path: 'glossary/:id/entries/:entryId/edit',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/glossary/glossary-entry-form/glossary-entry-form').then(
                (m) => m.GlossaryEntryFormComponent,
              ),
          },
        ],
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
