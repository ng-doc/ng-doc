import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';
import {isPresent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		readonly context: NgDocContext,
	) {
		console.log('context', this.context);
	}

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
}
