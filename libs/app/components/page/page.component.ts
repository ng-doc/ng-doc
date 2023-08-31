import { NgComponentOutlet, NgIf } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	inject,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, UrlTree } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocBreadcrumbComponent } from '@ng-doc/app/components/breadcrumb';
import { NgDocTocComponent } from '@ng-doc/app/components/toc';
import { createComponent, generateToc } from '@ng-doc/app/helpers';
import {
	NgDocContext,
	NgDocNavigation,
	NgDocPageNavigation,
	NgDocPageSkeleton,
} from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes/sanitize-html';
import { NgDocPageProcessorDirective } from '@ng-doc/app/processors';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import {
	NgDocBooleanControlComponent,
	NgDocNumberControlComponent,
	NgDocStringControlComponent,
	NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import { isPresent } from '@ng-doc/core';
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
		RouterLink,
		NgDocTextComponent,
		NgDocTextLeftDirective,
		NgDocTextRightDirective,
		NgDocMediaQueryDirective,
		NgDocTocComponent,
		NgDocSanitizeHtmlPipe,
		NgDocPageProcessorDirective,
		NgComponentOutlet,
	],
	providers: [
		provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
		provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
		provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
		provideTypeControl('boolean', NgDocBooleanControlComponent, { hideLabel: true, order: 40 }),
	],
})
export class NgDocPageComponent implements AfterViewInit {
	@ViewChild('pageContainer', { read: ElementRef, static: true })
	pageContainer!: ElementRef<HTMLElement>;

	@ViewChild('pageBreadcrumbs', { read: ViewContainerRef, static: true })
	pageBreadcrumbs!: ViewContainerRef;

	@ViewChild('pageNavigation', { read: ViewContainerRef, static: true })
	pageNavigation!: ViewContainerRef;

	@ViewChild('pageToc', { read: ViewContainerRef })
	pageToc?: ViewContainerRef;

	protected rootPage: NgDocRootPage = inject(NgDocRootPage);
	protected skeleton: NgDocPageSkeleton = inject(NG_DOC_PAGE_SKELETON);
	protected context: NgDocContext = inject(NG_DOC_CONTEXT);
	protected router: Router = inject(Router);

	private breadcrumbs: string[] = inject(ActivatedRoute)
		.pathFromRoot.filter((route: ActivatedRoute) => !route.snapshot.url.length)
		.map((route: ActivatedRoute) => route.snapshot.title)
		.filter(isPresent);

	ngAfterViewInit(): void {
		if (this.rootPage.pageType === 'guide') {
			if (this.skeleton.breadcrumbs) {
				createComponent(this.pageBreadcrumbs, this.skeleton.breadcrumbs, {
					breadcrumbs: this.breadcrumbs,
				});
			}

			if (this.skeleton.navigation) {
				createComponent(this.pageNavigation, this.skeleton.navigation, this.navigationInputs());
			}
		}

		Promise.resolve().then(() => {
			if (this.pageToc && this.skeleton.toc) {
				createComponent(this.pageToc, this.skeleton.toc, {
					tableOfContent: generateToc(this.pageContainer.nativeElement),
				});
			}
		});
	}

	private navigationInputs(): NgDocPageNavigation {
		const flatItems = (items: NgDocNavigation[]): NgDocNavigation[] =>
			items
				.map((item: NgDocNavigation) => [item.children?.length ? flatItems(item.children) : item])
				.flat(2);
		const flatPages: NgDocNavigation[] = flatItems(this.context.navigation);

		return {
			prevPage:
				flatPages[flatPages.findIndex((item: NgDocNavigation) => this.url === item.route) - 1],
			nextPage:
				flatPages[flatPages.findIndex((item: NgDocNavigation) => this.url === item.route) + 1],
		};
	}

	private get url(): string {
		const urlTree: UrlTree = this.router.parseUrl(this.router.url);

		urlTree.queryParams = {};
		urlTree.fragment = null;

		return urlTree.toString();
	}
}
