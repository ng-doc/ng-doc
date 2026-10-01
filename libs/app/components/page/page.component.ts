import { Clipboard } from '@angular/cdk/clipboard';
import { isPlatformBrowser } from '@angular/common';
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
import { RouterOutlet } from '@angular/router';
import { NgDocContentAnchorController } from '@ng-doc/app/classes/content-anchor-controller';
import { NgDocContentController } from '@ng-doc/app/classes/content-controller';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { createComponent, generateToc, ɵrestoreNgDocHydrationSnapshot } from '@ng-doc/app/helpers';
import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import {
  NgDocBooleanControlComponent,
  NgDocNumberControlComponent,
  NgDocStringControlComponent,
  NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import {
  DialogOutletComponent,
  NgDocButtonIconComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { WA_LOCATION } from '@ng-web-apis/common';

/**
 * A generated page: its rendered content, the page actions (copy link, edit and view the source),
 * the table of contents it fills in, and the outlet of its fullscreen demos.
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
    RouterOutlet,
    DialogOutletComponent,
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
    '[attr.data-ng-doc-async-content]': 'rootPage.pageContentSource ? "" : null',
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
  private readonly contentAnchorController = inject(NgDocContentAnchorController);
  private readonly clipboard = inject(Clipboard);
  private readonly ngZone = inject(NgZone);
  private readonly location = inject(WA_LOCATION);
  private linkCopiedTimer?: ReturnType<typeof setTimeout>;
  /** Removes the server-rendered copy shown while asynchronous content loads. */
  private snapshot?: () => void;

  constructor() {
    if (this.rootPage.pageContentSource) {
      // Angular empties this host (it skips hydration) and the content loads asynchronously, so
      // the server-rendered page stays visible until the loaded content renders.
      if (isPlatformBrowser(inject(PLATFORM_ID))) {
        this.snapshot = ɵrestoreNgDocHydrationSnapshot(inject(ElementRef).nativeElement);
      }
      this.contentAnchorController.activate();
      this.contentController.connect(this.rootPage.pageContentSource);
    }
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
    });
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
    this.clipboard.copy(this.location.origin + this.location.pathname);
    this.linkCopied.set(true);
    clearTimeout(this.linkCopiedTimer);
    // The label timer must not hold the application unstable, so it runs outside the zone.
    this.linkCopiedTimer = this.ngZone.runOutsideAngular(() =>
      setTimeout(() => this.linkCopied.set(false), 1400),
    );
  }

  private releaseSnapshot(): void {
    const release = this.snapshot;

    this.snapshot = undefined;
    release?.();
  }
}
