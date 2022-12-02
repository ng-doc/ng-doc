import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, NgZone} from '@angular/core';
import {Event, NavigationEnd, Router} from '@angular/router';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';
import {isPresent} from '@ng-doc/core';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {filter} from 'rxjs/operators';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';

@Component({
	selector: 'ng-doc-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocSidebarComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		readonly context: NgDocContext,
		private readonly router: Router,
		private readonly changeDetectorRef: ChangeDetectorRef,
		private readonly ngZone: NgZone,
	) {
		console.log('context', this.context);

		/**
		 * We need to update this component every time a navigation occurs to expand the category if its child node is currently rendered
		 */
		this.router.events
			.pipe(
				filter((event: Event) => event instanceof NavigationEnd),
				ngDocZoneOptimize(this.ngZone),
				untilDestroyed(this),
			)
			.subscribe(() => this.changeDetectorRef.markForCheck());
	}

	/**
	 * Description
	 *
	 * @param {NgDocNavigation} nav  - some param, that can return `ThisCode` and somethin else
	 * @returns {NgDocNavigation} - something
	 */
	getNavigation(nav?: NgDocNavigation): NgDocNavigation[] {
		return (nav ? nav.children ?? [] : this.context.navigation).sort((a: NgDocNavigation, b: NgDocNavigation) => {
			if (isPresent(a.order) && isPresent(b.order)) {
				return a.order - b.order;
			}
			if (isPresent(a.order)) {
				return -1;
			}
			if (isPresent(b.order)) {
				return 1;
			}
			return a.title.localeCompare(b.title);
		});
	}

	isExpanded(item: NgDocNavigation): boolean {
		return !!item?.expanded || !item?.expandable || this.router.url.includes(item.route ?? '', 0);
	}
}
