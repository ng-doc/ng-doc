import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input} from '@angular/core';
import {NgDocNavigation} from '@ng-doc/app/interfaces';
import {PolymorpheusContent} from '@tinkoff/ng-polymorpheus';
import {Event, NavigationEnd, Router} from '@angular/router';
import {filter, first, startWith} from 'rxjs/operators';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';

@Component({
	selector: 'ng-doc-sidebar-category',
	templateUrl: './sidebar-category.component.html',
	styleUrls: ['./sidebar-category.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
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

	constructor(
		private readonly router: Router,
		private readonly changeDetectorRef: ChangeDetectorRef,
	) {
		/**
		 * We need to update this component every time a navigation occurs to expand the category if its child node is currently rendered
		 */
		this.router.events
			.pipe(
				filter((event: Event) => event instanceof NavigationEnd),
				startWith(null),
				filter(() => this.router.url.includes(this.category?.route ?? '', 0)),
				untilDestroyed(this),
			)
			.subscribe(() => this.expand());
	}

	toggle(): void {
		this.expanded ? this.collapse() : this.expand();
	}

	expand(): void {
		if (this.category?.expandable) {
			this.expanded = true;
			this.changeDetectorRef.markForCheck();
		}
	}

	collapse(): void {
		if (this.category?.expandable) {
			this.expanded = false;
			this.changeDetectorRef.markForCheck();
		}
	}
}
