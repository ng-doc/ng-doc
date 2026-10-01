import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  input,
  OnInit,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  Routes,
} from '@angular/router';
import { NgDocPageHeaderComponent } from '@ng-doc/app/components/page-header';
import { createComponent } from '@ng-doc/app/helpers';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import { NgDocRoutePreloader } from '@ng-doc/app/services/route-preloader';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import type { NgDocContentSource } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import {
  NgDocIconComponent,
  NgDocTabRouteComponent,
  NgDocTabRoutesGroupComponent,
} from '@ng-doc/ui-kit';

/**
 * Layout of a generated page: the breadcrumbs, the page header, the tabs of a page with several
 * routes, the page itself, the previous and next page links, and the table of contents beside it.
 *
 * The breadcrumbs, the page links and the table of contents are the page skeleton's components,
 * created in the containers this component exposes.
 */
@Component({
  selector: 'ng-doc-page-wrapper',
  imports: [
    RouterOutlet,
    RouterLink,
    NgDocTabRouteComponent,
    NgDocTabRoutesGroupComponent,
    RouterLinkActive,
    NgDocIconComponent,
    NgDocPageHeaderComponent,
  ],
  templateUrl: './page-wrapper.component.html',
  styleUrl: './page-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-page-tabs]': 'routes().length > 1',
  },
})
export class NgDocPageWrapperComponent implements OnInit {
  /** Routes of the page; a page with more than one gets tabs. */
  readonly routes = input.required<Routes>();

  /** HTML of the page header. */
  readonly headerContent = input.required<string>();

  /** Deferred source of the page header, for generated pages that load it separately. */
  readonly headerContentSource = input<NgDocContentSource>();

  /** Whether the page shows breadcrumbs. */
  readonly hasBreadcrumb = input<boolean, unknown>(true, { transform: booleanAttribute });

  /** Type of the page: guides get previous and next page links, API pages do not. */
  readonly pageType = input<NgDocPageType>('guide');

  /** Container of the breadcrumbs. */
  readonly pageBreadcrumbs = viewChild.required('pageBreadcrumbs', { read: ViewContainerRef });

  /** Container of the table of contents. */
  readonly pageToc = viewChild.required('pageToc', { read: ViewContainerRef });

  /** Container of the previous and next page links. */
  readonly pageNavigation = viewChild.required('pageNavigation', { read: ViewContainerRef });

  protected skeleton = inject(NG_DOC_PAGE_SKELETON);
  protected router = inject(Router);
  protected route = inject(ActivatedRoute);
  protected context = inject(NG_DOC_CONTEXT);

  private breadcrumbs: string[] = inject(ActivatedRoute)
    .pathFromRoot.filter((route: ActivatedRoute) => !!route.snapshot.url.length)
    .map((route: ActivatedRoute) => route.snapshot.title)
    .filter(isPresent);

  private readonly preloader = inject(NgDocRoutePreloader);
  private readonly injector = inject(Injector);

  ngOnInit(): void {
    if (this.skeleton.breadcrumbs && this.hasBreadcrumb()) {
      createComponent(this.pageBreadcrumbs(), this.skeleton.breadcrumbs, {
        breadcrumbs: this.breadcrumbs,
      });
    }

    if (this.pageType() === 'guide' && this.skeleton.navigation) {
      createComponent(this.pageNavigation(), this.skeleton.navigation, this.adjacentPages());
    }

    // Readers often go on to the previous or next guide, so both are preloaded once the browser
    // is idle after this one has rendered. Render hooks never run on the server.
    afterNextRender(
      () => {
        if (this.pageType() !== 'guide') return;

        const { prevPage, nextPage } = this.adjacentPages();

        this.preloader.preloadWhenIdle([prevPage?.route, nextPage?.route]);
      },
      { injector: this.injector },
    );
  }

  private adjacentPages(): { prevPage?: NgDocNavigation; nextPage?: NgDocNavigation } {
    const url =
      '/' +
      this.route.pathFromRoot
        .map((route: ActivatedRoute) => route.snapshot.url)
        .flat()
        .join('/');
    const flatItems = (items: NgDocNavigation[]): NgDocNavigation[] =>
      items
        .map((item: NgDocNavigation) => [item.children?.length ? flatItems(item.children) : item])
        .flat(2);
    const flatPages: NgDocNavigation[] = flatItems(this.context.navigation);

    return {
      prevPage: flatPages[flatPages.findIndex((item: NgDocNavigation) => url === item.route) - 1],
      nextPage: flatPages[flatPages.findIndex((item: NgDocNavigation) => url === item.route) + 1],
    };
  }
}
