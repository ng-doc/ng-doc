import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  NgDocNavbarComponent,
  NgDocSidebarComponent,
  NgDocThemeToggleComponent,
} from '@ng-doc/app';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { NgDocButtonIconComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';
import { filter, map } from 'rxjs/operators';

/** Top-level sections of the site, linked from the header. */
type SiteSection = 'guides' | 'api' | 'migrations';

@Component({
  selector: 'ng-doc-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocRootComponent,
    NgDocNavbarComponent,
    RouterLink,
    NgDocThemeToggleComponent,
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocSidebarComponent,
    RouterOutlet,
  ],
  host: {
    '[attr.data-ng-doc-is-landing]': 'isLandingPage()',
  },
})
export class AppComponent {
  protected readonly year = new Date().getFullYear();

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentPath()),
    ),
    { initialValue: this.currentPath() },
  );

  protected readonly isLandingPage = computed(() => this.path() === '/');

  protected readonly section = computed<SiteSection | null>(() => {
    const path = this.path();

    if (path.startsWith('/docs/api')) {
      return 'api';
    }

    if (path.startsWith('/docs/upgrade')) {
      return 'migrations';
    }

    return path.startsWith('/docs') ? 'guides' : null;
  });

  private currentPath(): string {
    return '/' + this.location.path().split(/[?#]/)[0].replace(/^\//, '');
  }
}
