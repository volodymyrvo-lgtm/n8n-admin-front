import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { areaGuard } from './core/guards/area.guard';
import { inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { guestGuard } from './core/guards/guest.guard';

/** A section's landing page: its jobs list, or - for a role without jobs (the reader) - its rule sets. */
const sectionHome = () => (inject(AuthService).canAccess('jobs') ? 'jobs' : 'rule-sets');

/** The Design section's landing page: its jobs list, or - for a role without jobs (the reader) - the banners. */
const designHome = () => (inject(AuthService).canAccess('jobs') ? 'jobs' : 'banners');

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
      // Landing page right after login: pick which generation flow to
      // work in (see FlowHubComponent). Only "Content Generation" - the
      // dashboard layout below - actually exists yet.
      { path: '', pathMatch: 'full', redirectTo: 'flows' },
      {
        path: 'flows',
        loadComponent: () => import('./features/flows/flow-hub/flow-hub').then((m) => m.FlowHubComponent),
      },
      // LLM spend dashboard, opened from the "Dashboard" tile on the hub.
      // A standalone page (own top bar, no Content Generation sidebar).
      {
        path: 'usage',
        canActivate: [areaGuard('dashboard')],
        loadComponent: () => import('./features/llm-usage/llm-usage').then((m) => m.LlmUsageComponent),
      },
      // Error logs reported by n8n for jobs of either flow: a standalone page like the dashboard.
      {
        path: 'job-errors',
        canActivate: [areaGuard('errors')],
        loadComponent: () => import('./features/job-errors/job-errors').then((m) => m.JobErrorsComponent),
      },
      // SEO Generation: its own section with its own sidebar (the same
      // layout component, told by `data.section` to show the SEO menu).
      // Prompts reuse the Content Generation pages - `data.kind` makes
      // them list/create/edit SEO prompts instead (see PromptsService).
      {
        path: 'seo',
        canActivate: [areaGuard('jobs', 'documents')],
        data: { section: 'seo' },
        loadComponent: () =>
          import('./layout/dashboard-layout/dashboard-layout').then((m) => m.DashboardLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: sectionHome },
          {
            path: 'jobs',
            canActivate: [areaGuard('jobs')],
            loadComponent: () => import('./features/seo/seo-job-list/seo-job-list').then((m) => m.SeoJobListComponent),
          },
          {
            path: 'jobs/new',
            canActivate: [areaGuard('jobs')],
            loadComponent: () => import('./features/seo/add-seo-job/add-seo-job').then((m) => m.AddSeoJobComponent),
          },
          {
            path: 'rule-sets',
            canActivate: [areaGuard('documents')],
            data: { kind: 'seo' },
            loadComponent: () => import('./features/rule-sets/rule-sets').then((m) => m.RuleSetsComponent),
          },
          {
            path: 'rule-sets/new',
            canActivate: [adminGuard],
            data: { kind: 'seo' },
            loadComponent: () =>
              import('./features/rule-sets/rule-set-form/rule-set-form').then((m) => m.RuleSetFormComponent),
          },
          {
            path: 'rule-sets/:id/edit',
            canActivate: [adminGuard],
            data: { kind: 'seo' },
            loadComponent: () =>
              import('./features/rule-sets/rule-set-form/rule-set-form').then((m) => m.RuleSetFormComponent),
          },
          {
            path: 'prompts',
            canActivate: [areaGuard('documents')],
            data: { kind: 'seo' },
            loadComponent: () => import('./features/prompts/prompts').then((m) => m.PromptsComponent),
          },
          {
            path: 'prompts/new',
            canActivate: [adminGuard],
            data: { kind: 'seo' },
            loadComponent: () =>
              import('./features/prompts/prompt-form/prompt-form').then((m) => m.PromptFormComponent),
          },
          {
            path: 'prompts/:id/edit',
            canActivate: [adminGuard],
            data: { kind: 'seo' },
            loadComponent: () =>
              import('./features/prompts/prompt-form/prompt-form').then((m) => m.PromptFormComponent),
          },
        ],
      },
      // Design Generation: its own section (the same sidebar layout, told by
      // `data.section` to show the design menu) - the jobs list, the "add job"
      // form and the banners.
      {
        path: 'design',
        canActivate: [areaGuard('jobs', 'banners')],
        data: { section: 'design' },
        loadComponent: () =>
          import('./layout/dashboard-layout/dashboard-layout').then((m) => m.DashboardLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: designHome },
          {
            path: 'jobs',
            canActivate: [areaGuard('jobs')],
            loadComponent: () =>
              import('./features/design/design-job-list/design-job-list').then((m) => m.DesignJobListComponent),
          },
          {
            path: 'jobs/new',
            canActivate: [areaGuard('jobs')],
            loadComponent: () =>
              import('./features/design/add-design-job/add-design-job').then((m) => m.AddDesignJobComponent),
          },
          {
            path: 'banners',
            canActivate: [areaGuard('banners')],
            loadComponent: () => import('./features/design/banners/banners').then((m) => m.BannersComponent),
          },
        ],
      },
      {
        path: '',
        canActivate: [areaGuard('jobs', 'documents', 'users')],
        loadComponent: () =>
          import('./layout/dashboard-layout/dashboard-layout').then((m) => m.DashboardLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: sectionHome },
          {
            path: 'jobs',
            canActivate: [areaGuard('jobs')],
            loadComponent: () => import('./features/jobs/job-list/job-list').then((m) => m.JobListComponent),
          },
          {
            path: 'jobs/new',
            canActivate: [areaGuard('jobs')],
            loadComponent: () => import('./features/jobs/add-job/add-job').then((m) => m.AddJobComponent),
          },
          {
            path: 'email',
            canActivate: [areaGuard('jobs')],
            loadComponent: () =>
              import('./features/email/email-generation/email-generation').then((m) => m.EmailGenerationComponent),
          },
          {
            path: 'updated-emails',
            canActivate: [areaGuard('jobs')],
            loadComponent: () =>
              import('./features/updated-emails/updated-emails').then((m) => m.UpdatedEmailsComponent),
          },
          {
            path: 'rule-sets',
            canActivate: [areaGuard('documents')],
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
            canActivate: [areaGuard('users')],
            loadComponent: () => import('./features/users/users').then((m) => m.UsersComponent),
          },
          {
            path: 'users/new',
            canActivate: [adminGuard],
            loadComponent: () => import('./features/users/add-user/add-user').then((m) => m.AddUserComponent),
          },
          {
            path: 'prompts',
            canActivate: [areaGuard('documents')],
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
            canActivate: [areaGuard('documents')],
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
            canActivate: [areaGuard('documents')],
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
