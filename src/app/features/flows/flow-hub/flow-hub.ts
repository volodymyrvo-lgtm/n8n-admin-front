import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

/**
 * The screen a user lands on right after login (see app.routes.ts) -
 * a hub to pick which generation flow to work in. "Content Generation"
 * is the only flow that actually exists yet (it's everything under
 * DashboardLayoutComponent - jobs, rule sets, prompts, glossary,
 * users); the other four are placeholders for flows not built yet, so
 * their cards render as disabled buttons rather than links.
 */
@Component({
  selector: 'app-flow-hub',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './flow-hub.html',
  styleUrl: './flow-hub.css',
})
export class FlowHubComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * A two-letter avatar initial from the logged-in user's email, e.g.
   * "volodymyr.vo@royale.team" -> "VV" (first letter of the two
   * dot-separated parts before the @), falling back to the first two
   * characters of the local part when there's no "." to split on.
   */
  protected readonly userInitials = computed(() => {
    const username = this.authService.currentUser()?.username ?? '';
    const localPart = username.split('@')[0] ?? '';
    const segments = localPart.split('.').filter(Boolean);

    const initials =
      segments.length >= 2
        ? `${segments[0][0]}${segments[1][0]}`
        : localPart.slice(0, 2);

    return initials.toUpperCase() || '?';
  });

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
