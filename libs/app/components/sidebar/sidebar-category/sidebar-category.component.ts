import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocNavigation} from '@ng-doc/app/interfaces';
import {PolymorpheusContent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-sidebar-category',
	templateUrl: './sidebar-category.component.html',
	styleUrls: ['./sidebar-category.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarCategoryComponent {
	@Input()
	category?: NgDocNavigation;

	@Input()
	@HostBinding('attr.data-ng-doc-is-root')
	isRoot: boolean = false;

	@Input()
	content: PolymorpheusContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-expandable')
	expandable: boolean = true;

	@Input()
	expanded: boolean = true;

	toggle(): void {
		if (this.category?.expandable) {
			this.expanded = !this.expanded;
		}
	}
}
