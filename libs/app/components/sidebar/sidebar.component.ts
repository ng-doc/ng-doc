import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';

@Component({
	selector: 'ng-doc-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		private readonly context: NgDocContext,
	) {}

	public get navigation(): NgDocNavigation[] {
		return this.context.navigation;
	}
}
