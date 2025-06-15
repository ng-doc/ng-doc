import { Location, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import { NG_DOC_CONTEXT } from '@ng-doc/app/tokens';
import { NgDocBindPipe, NgDocExecutePipe } from '@ng-doc/ui-kit';

import { NgDocSidebarCategoryComponent } from './sidebar-category/sidebar-category.component';
import { NgDocSidebarItemComponent } from './sidebar-item/sidebar-item.component';

@Component({
  selector: 'ng-doc-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    NgDocSidebarCategoryComponent,
    NgDocSidebarItemComponent,
    NgDocExecutePipe,
    NgDocBindPipe,
  ],
})
export class NgDocSidebarComponent {
  protected readonly location = inject(Location);
  protected readonly context = inject(NG_DOC_CONTEXT);

  getNavigation(nav?: NgDocNavigation): NgDocNavigation[] {
    return nav ? nav.children ?? [] : this.context.navigation;
  }

  matchRoute(route: string): boolean {
    return this.location.path().includes(route ?? '', 0);
  }
}
