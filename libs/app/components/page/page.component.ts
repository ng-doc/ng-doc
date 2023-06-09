import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {Router, RouterLink, UrlTree} from '@angular/router';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocBreadcrumbComponent} from '@ng-doc/app/components/breadcrumb';
import {NgDocTocComponent} from '@ng-doc/app/components/toc';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocContext, NgDocNavigation} from '@ng-doc/app/interfaces';
import {NgDocSanitizeHtmlPipe} from '@ng-doc/app/pipes/sanitize-html';
import {
	NgDocBlockquoteProcessorDirective,
	NgDocCodeProcessorDirective,
	NgDocDemoPaneProcessorDirective,
	NgDocDemoProcessorDirective,
	NgDocIconProcessorDirective,
	NgDocLinkProcessorDirective,
	NgDocPlaygroundProcessorDirective,
	NgDocTooltipProcessorDirective,
} from '@ng-doc/app/processors';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';
import {
	NgDocBooleanControlComponent,
	NgDocNumberControlComponent,
	NgDocStringControlComponent,
	NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent,
	NgDocMediaQueryDirective,
	NgDocTextComponent,
	NgDocTextLeftDirective,
	NgDocTextRightDirective,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-page',
	templateUrl: './page.component.html',
	styleUrls: ['./page.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgIf,
		NgDocBreadcrumbComponent,
		NgDocButtonIconComponent,
		NgDocTooltipDirective,
		NgDocIconComponent,
		NgDocBlockquoteProcessorDirective,
		NgDocIconProcessorDirective,
		/**
		 * The order of the directives is important.
		 * The higher the directive is in the list, the later it will be run.
		 *
		 * So here we want to render demos first, after that we want to render links
		 * and bind tooltips to them.
		 */
		NgDocTooltipProcessorDirective,
		NgDocLinkProcessorDirective,
		NgDocCodeProcessorDirective,
		NgDocDemoProcessorDirective,
		NgDocDemoPaneProcessorDirective,
		NgDocPlaygroundProcessorDirective,
		RouterLink,
		NgDocTextComponent,
		NgDocTextLeftDirective,
		NgDocTextRightDirective,
		NgDocMediaQueryDirective,
		NgDocTocComponent,
		NgDocSanitizeHtmlPipe,
	],
	providers: [
		provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, {order: 10}),
		provideTypeControl('string', NgDocStringControlComponent, {order: 20}),
		provideTypeControl('number', NgDocNumberControlComponent, {order: 30}),
		provideTypeControl('boolean', NgDocBooleanControlComponent, {hideLabel: true, order: 40}),
	],
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

		this.prevPage = flatPages[flatPages.findIndex((item: NgDocNavigation) => this.url === item.route) - 1];
		this.nextPage = flatPages[flatPages.findIndex((item: NgDocNavigation) => this.url === item.route) + 1];
	}

	private flatPages(items: NgDocNavigation[]): NgDocNavigation[] {
		return items.map((item: NgDocNavigation) => [item.children?.length ? this.flatPages(item.children) : item]).flat(2);
	}

	private get url(): string {
		const urlTree: UrlTree = this.router.parseUrl(this.router.url);

		urlTree.queryParams = {};
		urlTree.fragment = null;

		return urlTree.toString();
	}
}
