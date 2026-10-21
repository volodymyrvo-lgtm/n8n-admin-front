import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher';

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './dashboard-layout.html',
  styleUrl: './dashboard-layout.css',
})
/**
 * The sidebar shell shared by the two flows that have one: Content
 * Generation (the default menu) and SEO Generation. The route's
 * `data.section` ('seo') picks which menu is shown.
 */
export class DashboardLayoutComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isSeo = this.route.snapshot.data?.['section'] === 'seo';

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
