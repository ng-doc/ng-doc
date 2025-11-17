import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostBinding, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  NgDocNavbarComponent,
  NgDocSidebarComponent,
  NgDocThemeToggleComponent,
} from '@ng-doc/app';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import {
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

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
    NgDocIconComponent,
    NgDocSidebarComponent,
    RouterOutlet,
  ],
})
export class AppComponent {
  protected readonly location = inject(Location);

  @HostBinding('attr.data-ng-doc-is-landing')
  get isLandingPage(): boolean {
    return this.location.path() === '';
  }
}
