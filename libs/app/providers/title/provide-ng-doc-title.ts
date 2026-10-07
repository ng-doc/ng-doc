import {
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  Injectable,
  InjectionToken,
  makeEnvironmentProviders,
  runInInjectionContext,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * What the title of a route belongs to. NgDoc writes it as `ngDocTitle` into the `data` of the
 * routes it generates.
 */
type NgDocTitleKind = 'category' | 'page' | 'tab';

/** Route data key that names what a generated route's title belongs to. */
const TITLE_KIND_DATA: string = 'ngDocTitle';

/** Route data key of a page route that names the page type (`guide` or `api`). */
const PAGE_TYPE_DATA: string = 'ngDocPageType';

/**
 * The parts of the current route that `provideNgDocTitle` passes to its function.
 *
 * Outside the documentation (a landing page, for example), `categories` is empty and `page`,
 * `tab` and `api` are not set.
 */
export interface NgDocTitleContext {
  /**
   * The title Angular sets by default: the title of the deepest route that has one. It is not set
   * when no route of the navigation has a title.
   */
  readonly title: string | undefined;
  /** Titles of the categories that contain the page, the outermost category first. */
  readonly categories: readonly string[];
  /**
   * Title of the guide or the API list. A title in the page's own route replaces it. Not set on
   * an API page, which sets `api` instead.
   */
  readonly page: string | undefined;
  /**
   * Title of the active tab, when the page has more than one tab. Not set on a tab titled like
   * the page, usually its first one.
   */
  readonly tab: string | undefined;
  /** Name of the API declaration, on an API page. */
  readonly api: string | undefined;
  /** The router state the title is for. */
  readonly snapshot: RouterStateSnapshot;
}

/**
 * Builds the browser tab title from the parts of the current route. It runs in an injection
 * context, so it can call `inject()`. When it returns `undefined`, the title stays as it is.
 */
export type NgDocTitleFn = (context: NgDocTitleContext) => string | undefined;

/** The function that `provideNgDocTitle` was given. */
const NG_DOC_TITLE_FN = new InjectionToken<NgDocTitleFn>('NG_DOC_TITLE_FN');

/**
 * Title strategy that builds the document title with the function given to `provideNgDocTitle`,
 * from the categories, page, tab and API declaration of the current route. It stays internal:
 * `provideNgDocTitle` is the public way to set it.
 */
@Injectable()
class NgDocTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly injector = inject(EnvironmentInjector);
  private readonly titleFn = inject(NG_DOC_TITLE_FN);

  /**
   * Sets the document title for the router state.
   * @param snapshot - The router state after a navigation.
   */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = runInInjectionContext(this.injector, () =>
      this.titleFn(this.buildContext(snapshot)),
    );

    if (title !== undefined) {
      this.title.setTitle(title);
    }
  }

  /**
   * Collects the titles of the router state by what they belong to.
   * @param snapshot - The router state after a navigation.
   */
  buildContext(snapshot: RouterStateSnapshot): NgDocTitleContext {
    const categories: string[] = [];
    let page: string | undefined;
    let tab: string | undefined;
    let ownTitle: string | undefined;
    let isApi = false;

    for (
      let route: ActivatedRouteSnapshot | null = snapshot.root;
      route;
      route = route.firstChild
    ) {
      const config = route.routeConfig;

      if (config?.data?.[PAGE_TYPE_DATA] === 'api') {
        isApi = true;
      }

      // Only a route's own title counts: routes without one inherit the title of their parent,
      // which would repeat it.
      if (config?.title === undefined) {
        continue;
      }

      const title = this.getResolvedTitleForRoute(route);

      if (typeof title !== 'string') {
        continue;
      }

      switch (config.data?.[TITLE_KIND_DATA] as NgDocTitleKind | undefined) {
        case 'category':
          categories.push(title);
          break;
        case 'page':
          page = title;
          break;
        case 'tab':
          // A page with one tab shows no tabs, and the tab's title is the page's.
          if ((route.parent?.routeConfig?.children?.length ?? 0) > 1) {
            tab = title;
          }
          break;
        default:
          // A title below the page comes from the page's own `route`, and wins over the
          // generated one. Titles above the documentation belong to the application.
          if (page !== undefined) {
            ownTitle = title;
          }
      }
    }

    // The first tab of a page usually has no title of its own and shows the page's.
    if (tab === page) {
      tab = undefined;
    }

    page = ownTitle ?? page;

    return {
      title: this.buildTitle(snapshot),
      categories,
      page: isApi ? undefined : page,
      tab,
      api: isApi ? page : undefined,
      snapshot,
    };
  }
}

/**
 * Builds the browser tab title of every navigation with a function that receives the categories,
 * the page, the tab and the API declaration of the route, so titles like
 * "Installation · Getting started | NgDoc" need no parsing of route titles.
 *
 * Without it, Angular sets the title of the deepest route: the page's (or its tab's) title.
 * @param titleFn - Builds the title; `undefined` keeps the current title.
 * @example
 * ```ts
 * provideNgDocTitle(({ categories, page, tab, api, title }) => {
 *   const name = api ?? page;
 *
 *   return name
 *     ? [tab, name, ...[...categories].reverse()].filter(Boolean).join(' · ') + ' | My library'
 *     : (title ?? 'My library');
 * });
 * ```
 */
export function provideNgDocTitle(titleFn: NgDocTitleFn): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: NG_DOC_TITLE_FN, useValue: titleFn },
    { provide: TitleStrategy, useClass: NgDocTitleStrategy },
  ]);
}
