import { LocationStrategy, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Params, Router, RouterLink, UrlTree } from '@angular/router';
import { ɵngDocRouteUrl } from '@ng-doc/app/helpers';
import { NgDocIconComponent } from '@ng-doc/ui-kit';
import { WA_LOCATION } from '@ng-web-apis/common';

/** How a page link resolves its `href`. */
interface NgDocResolvedPageLink {
  link: URL;
  usesRouterLink: boolean;
  stripsRouterBase: boolean;
  routerBasePath: string;
}

/**
 * A link in the page content. Links inside the application navigate with the router; other links
 * open in a new tab and, outside code, show an external-link icon.
 */
@Component({
  selector: 'ng-doc-page-link',
  templateUrl: './page-link.component.html',
  styleUrls: ['./page-link.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, NgDocIconComponent],
})
export class NgDocPageLinkComponent implements OnInit {
  /**
   * The link target, as written in the content. It is optional so that a render before the
   * page processor sets it (auto-detected change detection) does not fail.
   */
  readonly href = input<string>('');

  /** Classes of the link element. */
  readonly classes = input<string>('');

  /** Whether the link sits inside a code element. */
  protected readonly isInCode = signal(false);

  private readonly location = inject(WA_LOCATION);
  private readonly locationStrategy = inject(LocationStrategy);
  private readonly router = inject(Router);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  private readonly resolved = computed<NgDocResolvedPageLink>(() => {
    const href: string = this.href();
    const resolvesFromCurrentPage = href.startsWith('#') || href.startsWith('?');
    const absoluteUrl = isAbsoluteUrl(href);
    // `#section` and `?query` resolve against the route, which with hash location is not the
    // document's path.
    const link = new URL(
      href,
      resolvesFromCurrentPage
        ? ɵngDocRouteUrl(this.locationStrategy, this.location.href)
        : this.location.origin,
    );
    const routerBasePath = normalizeRouterBasePath(
      this.locationStrategy.getBaseHref(),
      this.location.origin,
    );
    const usesRouterLink =
      link.origin === this.location.origin &&
      (!absoluteUrl || isPathWithinBase(link.pathname, routerBasePath));

    return {
      link,
      usesRouterLink,
      stripsRouterBase: usesRouterLink && (resolvesFromCurrentPage || absoluteUrl),
      routerBasePath,
    };
  });

  /** Whether the link navigates with the router. */
  protected readonly usesRouterLink = computed(() => this.resolved().usesRouterLink);

  /** The router target of an application link. */
  protected readonly routerLink = computed<UrlTree | undefined>(() => {
    const { link, usesRouterLink } = this.resolved();

    return usesRouterLink
      ? this.router.parseUrl(escapeInvalidPercents(`${this.path()}${link.search}${link.hash}`))
      : undefined;
  });

  /** Whether the link leaves the application's origin. */
  readonly isExternalLink = computed(() => this.resolved().link.origin !== this.location.origin);

  /** The path of an application link, or the `href` of any other link. */
  readonly path = computed(() => {
    const { link, usesRouterLink, stripsRouterBase, routerBasePath } = this.resolved();

    if (!usesRouterLink) {
      return this.href();
    }

    return stripsRouterBase ? stripRouterBase(link.pathname, routerBasePath) : link.pathname;
  });

  /** The fragment of the link, without `#`. */
  readonly fragment = computed(() => this.resolved().link.hash.replace(/^#/, '') || undefined);

  /** The query parameters of the link. */
  readonly queryParams = computed<Params>(() =>
    Object.fromEntries(this.resolved().link.searchParams.entries()),
  );

  ngOnInit(): void {
    this.isInCode.set(this.elementRef.nativeElement.closest('code') !== null);
  }
}

/**
 *
 * @param href
 */
function isAbsoluteUrl(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//');
}

/**
 *
 * @param baseHref
 * @param origin
 */
function normalizeRouterBasePath(baseHref: string, origin: string): string {
  const pathname = new URL(baseHref || '/', origin).pathname;

  if (pathname === '/') {
    return pathname;
  }

  return `/${pathname.replace(/^\/+|\/+$/g, '')}/`;
}

/**
 *
 * @param pathname
 * @param basePath
 */
function isPathWithinBase(pathname: string, basePath: string): boolean {
  return basePath === '/' || pathname === basePath.slice(0, -1) || pathname.startsWith(basePath);
}

/**
 *
 * @param pathname
 * @param basePath
 */
function stripRouterBase(pathname: string, basePath: string): string {
  if (basePath === '/' || !isPathWithinBase(pathname, basePath)) {
    return pathname;
  }

  if (pathname === basePath.slice(0, -1)) {
    return '/';
  }

  return `/${pathname.slice(basePath.length)}`;
}

/**
 *
 * @param url
 */
function escapeInvalidPercents(url: string): string {
  return url.replace(/%(?![\da-f]{2})/gi, '%25');
}
