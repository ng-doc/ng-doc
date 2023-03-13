import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';
import {isPresent} from '@ng-doc/core/helpers/is-present';

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
	) {}

	/**
	 * Description
	 *
	 * @param {NgDocNavigation} nav  - some param, that can return `ThisCode` and somethin else
	 * @returns {NgDocNavigation} - something
	 */
	getNavigation(nav?: NgDocNavigation): NgDocNavigation[] {
		return nav ? nav.children ?? [] : this.context.navigation;
	}
}
