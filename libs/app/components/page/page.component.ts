import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';

@Component({
	selector: 'ng-doc-page',
	templateUrl: './page.component.html',
	styleUrls: ['./page.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageComponent {
	readonly prevPage?: NgDocNavigation;
	readonly nextPage?: NgDocNavigation;
	constructor(
		@Inject(NG_DOC_CONTEXT)
		private readonly context: NgDocContext,
		private readonly router: Router,
		readonly rootPage: NgDocRootPage,
	) {
		const flatPages = this.flatPages(this.context.navigation);

		this.prevPage =
			flatPages[
				flatPages.findIndex((item: NgDocNavigation) => this.router.url.includes(item.route ?? '', 0)) - 1
			];
		this.nextPage =
			flatPages[
				flatPages.findIndex((item: NgDocNavigation) => this.router.url.includes(item.route ?? '', 0)) + 1
			];
	}

	private flatPages(items: NgDocNavigation[]): NgDocNavigation[] {
		return items
			.map((item: NgDocNavigation) => [item.children?.length ? this.flatPages(item.children) : item])
			.flat(2);
	}
}
