import { Clipboard } from '@angular/cdk/clipboard';
import { isPlatformBrowser, LocationStrategy } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  NgZone,
  PLATFORM_ID,
  reflectComponentType,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { NgDocContentAnchorController } from '@ng-doc/app/classes/content-anchor-controller';
import { NgDocContentController } from '@ng-doc/app/classes/content-controller';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import {
  createComponent,
  generateToc,
  ɵngDocPageUrl,
  ɵrestoreNgDocHydrationSnapshot,
} from '@ng-doc/app/helpers';
import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import { NgDocFullscreenRouteService } from '@ng-doc/app/services/fullscreen-route';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import {
  NgDocBooleanControlComponent,
  NgDocNumberControlComponent,
  NgDocStringControlComponent,
  NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import type { NgDocContentSource } from '@ng-doc/core/interfaces';
import { NgDocButtonIconComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';
import { WA_LOCATION } from '@ng-web-apis/common';

/**
 * A generated page: its rendered content, the page actions (copy link, edit and view the source),
 * the table of contents it fills in, and the outlet of its fullscreen routes.
 *
 * A fullscreen route (a child route of the page, unless the page sets `disableFullscreenRoutes`)
 * replaces the page: it is shown on its own on the canvas of demos, with a link back to the page,
 * and `NgDocFullscreenRouteService` tells the root layout and the page wrapper to hide their
 * chrome.
 */
@Component({
  selector: 'ng-doc-page',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocPageProcessorComponent,
    RouterLink,
    RouterOutlet,
    NgDocSanitizeHtmlPipe,
  ],
  providers: [
    NgDocContentAnchorController,
    NgDocContentController,
    provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
    provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
    provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
    provideTypeControl('boolean', NgDocBooleanControlComponent, { order: 40 }),
  ],
  host: {
    ngSkipHydration: 'true',
    // Tells the browser that the server-rendered content must be kept until the loaded content
    // renders (ɵNG_DOC_ASYNC_CONTENT_ATTRIBUTE).
    '[attr.data-ng-doc-async-content]':
      'rootPage.pageContentSource && !fullscreenRoute() ? "" : null',
  },
})
export class NgDocPageComponent {
  /** The element that holds the rendered page content. */
  readonly pageContainer = viewChild('pageContainer', { read: ElementRef<HTMLElement> });

  protected rootPage: NgDocRootPage = inject(NgDocRootPage);
  protected skeleton: NgDocPageSkeleton = inject(NG_DOC_PAGE_SKELETON);
  protected changeDetectorRef = inject(ChangeDetectorRef);

  protected pageWrapper: NgDocPageWrapperComponent = inject(NgDocPageWrapperComponent);
  protected readonly contentController = inject(NgDocContentController);
  /** Whether the link to the page was just copied. */
  protected readonly linkCopied = signal(false);
  /** Whether one of the page's fullscreen routes is shown instead of the page. */
  protected readonly fullscreenRoute = signal(false);
  /** URL of the page, for the link back from a fullscreen route. */
  protected readonly pageUrl = signal('/');
  private readonly route = inject(ActivatedRoute);
  private readonly fullscreenRoutes = inject(NgDocFullscreenRouteService);
  private readonly contentAnchorController = inject(NgDocContentAnchorController);
  private readonly clipboard = inject(Clipboard);
  private readonly ngZone = inject(NgZone);
  private readonly location = inject(WA_LOCATION);
  private readonly locationStrategy = inject(LocationStrategy);
  private linkCopiedTimer?: ReturnType<typeof setTimeout>;
  /** Removes the server-rendered copy shown while asynchronous content loads. */
  private snapshot?: () => void;

  constructor() {
    // The router state is complete when the page is created, so a fullscreen route opened
    // directly (a new tab) is known before the first render and the page content never renders.
    this.showFullscreenRoute(!!this.route.firstChild);

    const source: NgDocContentSource | undefined = this.rootPage.pageContentSource;

    if (source && !this.fullscreenRoute()) {
      // Angular empties this host (it skips hydration) and the content loads asynchronously, so
      // the server-rendered page stays visible until the loaded content renders.
      if (isPlatformBrowser(inject(PLATFORM_ID))) {
        this.snapshot = ɵrestoreNgDocHydrationSnapshot(inject(ElementRef).nativeElement);
      }
      this.connectContent(source);
    }
    // A page opened on a fullscreen route loads its content only when the reader goes back to
    // it, because pending content holds the application unstable until it renders. An effect,
    // so a page that is leaving (its route closes as it is destroyed) loads nothing.
    effect(() => {
      if (source && !this.fullscreenRoute()) untracked(() => this.connectContent(source));
    });
    // A load that needs no new pass (its content is already rendered, for example an empty body)
    // or that failed settles without `revealLoaded`.
    effect(() => {
      if (this.contentController.settled()) untracked(() => this.releaseSnapshot());
    });
    effect(() => {
      if (this.contentController.error()) {
        untracked(() => {
          this.releaseSnapshot();
          this.pageWrapper.pageToc().clear();
          this.contentAnchorController.contentFailed();
        });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.linkCopiedTimer);
      this.releaseSnapshot();
      this.fullscreenRoutes.set(this, false);
    });
  }

  /**
   * Shows one of the page's fullscreen routes instead of the page, or the page again. The outlet
   * of the fullscreen routes calls it when a route opens or closes.
   * @param shown - Whether a fullscreen route is shown.
   */
  protected showFullscreenRoute(shown: boolean): void {
    // Pages that disable fullscreen routes render their child routes themselves.
    const fullscreen: boolean = shown && !this.rootPage.page?.disableFullscreenRoutes;

    if (fullscreen) {
      this.pageUrl.set(
        '/' +
          this.route.pathFromRoot
            .flatMap((route: ActivatedRoute) => route.snapshot.url)
            .map((segment) => segment.path)
            .join('/'),
      );
    }
    this.fullscreenRoute.set(fullscreen);
    this.fullscreenRoutes.set(this, fullscreen);
  }

  /**
   * Creates the table of contents from the headings of the rendered page.
   */
  createToc(): void {
    const container = this.pageContainer();
    const pageToc = this.pageWrapper.pageToc();

    pageToc.clear();
    if (container && this.skeleton.toc) {
      const inputs: Record<string, unknown> = {
        tableOfContent: generateToc(container.nativeElement) ?? [],
      };
      // Only components that declare the input get it: a custom table of contents may not.
      const declared = reflectComponentType(this.skeleton.toc)?.inputs ?? [];

      if (declared.some(({ templateName }) => templateName === 'editSourceFileUrl')) {
        inputs['editSourceFileUrl'] = this.rootPage.editSourceFileUrl;
      }

      // API pages carry their symbol details for the rail, hidden in the content.
      const details = container.nativeElement.querySelector('[data-ng-doc-rail-details]');

      if (details && declared.some(({ templateName }) => templateName === 'details')) {
        details.removeAttribute('hidden');
        inputs['details'] = details;
      }

      createComponent(pageToc, this.skeleton.toc, inputs);

      this.changeDetectorRef.detectChanges();
    }
    if (this.rootPage.pageContentSource) this.contentAnchorController.contentProcessed();
  }

  /**
   * Shows the page's own content in place of the server-rendered copy when a pass of the loaded
   * content is about to render, in the same task, so its components render and measure visible.
   * The pass of the empty content before the source has loaded keeps the copy.
   * @param version - The content version of the pass.
   * @internal
   */
  protected revealLoaded(version: number): void {
    if (version === this.contentController.loadedVersion()) this.releaseSnapshot();
  }

  /**
   * Copies the link to the page, without its query and fragment.
   */
  copyLink(): void {
    this.clipboard.copy(ɵngDocPageUrl(this.locationStrategy, this.location));
    this.linkCopied.set(true);
    clearTimeout(this.linkCopiedTimer);
    // The label timer must not hold the application unstable, so it runs outside the zone.
    this.linkCopiedTimer = this.ngZone.runOutsideAngular(() =>
      setTimeout(() => this.linkCopied.set(false), 1400),
    );
  }

  private connectContent(source: NgDocContentSource): void {
    // Both calls do nothing once the source is connected.
    this.contentAnchorController.activate();
    this.contentController.connect(source);
  }

  private releaseSnapshot(): void {
    const release = this.snapshot;

    this.snapshot = undefined;
    release?.();
  }
}
