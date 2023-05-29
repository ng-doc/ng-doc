import {NgFor, NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';

import {NgDocSidebarCategoryComponent} from './sidebar-category/sidebar-category.component';
import {NgDocSidebarItemComponent} from './sidebar-item/sidebar-item.component';

@Component({
	selector: 'ng-doc-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgFor, NgTemplateOutlet, NgIf, NgDocSidebarCategoryComponent, NgDocSidebarItemComponent],
})
export class NgDocSidebarComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		readonly context: NgDocContext,
	) {}

	getNavigation(nav?: NgDocNavigation): NgDocNavigation[] {
		return nav ? nav.children ?? [] : this.context.navigation;
	}
}
