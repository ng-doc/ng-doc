import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { NgDocContentController } from '@ng-doc/app/classes/content-controller';
import { ɵrestoreNgDocHydrationSnapshot } from '@ng-doc/app/helpers';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors';
import type { NgDocContentSource } from '@ng-doc/core/interfaces';

/**
 * The header of a documentation page: the rendered header HTML, or the header of an
 * asynchronous content source.
 */
@Component({
  selector: 'ng-doc-page-header',
  imports: [NgDocPageProcessorComponent, NgDocSanitizeHtmlPipe],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NgDocContentController],
  host: {
    ngSkipHydration: 'true',
    // Tells the browser that the server-rendered header must be kept until the loaded one
    // renders (ɵNG_DOC_ASYNC_CONTENT_ATTRIBUTE).
    '[attr.data-ng-doc-async-content]': 'headerContentSource() ? "" : null',
  },
})
export class NgDocPageHeaderComponent {
  /** The rendered header HTML, used when there is no content source. */
  readonly headerContent = input.required<string>();

  /** The source of the header content, for pages whose content loads asynchronously. */
  readonly headerContentSource = input<NgDocContentSource>();

  protected readonly contentController = inject(NgDocContentController);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Removes the server-rendered copy shown while asynchronous content loads. */
  private snapshot?: () => void;

  constructor() {
    // Connects the controller to the current source, before the template renders its content.
    effect(() => {
      const source = this.headerContentSource();

      untracked(() => {
        if (source) {
          // Angular empties this host (it skips hydration) and the header loads asynchronously,
          // so the server-rendered header stays visible until the loaded one renders. The copy
          // is shown once, for the host's first source.
          if (this.browser && !this.snapshot)
            this.snapshot = ɵrestoreNgDocHydrationSnapshot(this.host);
          this.contentController.connect(source);
        } else {
          this.releaseSnapshot();
          this.contentController.disconnect();
        }
      });
    });
    // A load that needs no new pass (its header is already rendered) or that failed settles
    // without `revealLoaded`.
    effect(() => {
      if (this.contentController.settled()) untracked(() => this.releaseSnapshot());
    });
    effect(() => {
      if (this.contentController.error()) untracked(() => this.releaseSnapshot());
    });
    inject(DestroyRef).onDestroy(() => this.releaseSnapshot());
  }

  /**
   * Shows the loaded header in place of the server-rendered copy when a pass of it is about to
   * render, in the same task. The pass of the empty header before the source has loaded keeps
   * the copy.
   * @param version - The content version of the pass.
   * @internal
   */
  protected revealLoaded(version: number): void {
    if (version === this.contentController.loadedVersion()) this.releaseSnapshot();
  }

  private releaseSnapshot(): void {
    const release = this.snapshot;

    this.snapshot = undefined;
    release?.();
  }
}
