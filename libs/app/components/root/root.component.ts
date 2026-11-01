import { ViewportScroller } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { NgDocNavigationTexts } from '@ng-doc/app/interfaces';
import { NgDocFullscreenRouteService } from '@ng-doc/app/services/fullscreen-route';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { NgDocSidebarService } from '@ng-doc/app/services/sidebar';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NgDocContent, NgDocSidenavComponent } from '@ng-doc/ui-kit';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/**
 * Directive uses for providing custom navbar, you should mark element with this directive
 * and the `NgDocRootComponent` will use it as a navbar
 *
 * ```html
 * <ng-doc-root>
 *     <my-custom-navbar ngDocCustomNavbar></my-custom-navbar>
 *
 *     <ng-doc-sidebar></ng-doc-sidebar>
 *     <router-outlet></router-outlet>
 * </ng-doc-root>
 * ```
 */
@Directive({
  selector: '[ngDocCustomNavbar]',
})
export class NgDocCustomNavbarDirective {}

/**
 * Directive uses for providing custom sidebar, you should mark element with this directive
 * and the `NgDocRootComponent` will use it as a sidebar
 *
 * ```html
 * <ng-doc-root>
 *     <ng-doc-navbar></ng-doc-sidebar>
 *
 *     <my-custom-sidebar ngDocCustomSidebar></my-custom-sidebar>
 *     <router-outlet></router-outlet>
 * </ng-doc-root>
 * ```
 */
@Directive({
  selector: '[ngDocCustomSidebar]',
})
export class NgDocCustomSidebarDirective {}

/**
 * How far the router scrolls an anchor below the top of the layout, in pixels: the navbar, the
 * sticky page tabs and some space. The layout's top offset (the CSS variable that makes room for
 * an application header above the layout) is added to it.
 */
const SCROLL_OFFSET = 120;

/** The offset function of `ViewportScroller`, which has no public getter. */
type NgDocScrollOffset = () => [number, number];

/**
 * Root layout of the NgDoc application: the navbar, the sidebar, the page and the footer.
 *
 * Its first focusable element is a "Skip to content" link, shown only while it has focus, that
 * moves keyboard focus past the navbar and the sidebar to the page.
 *
 * While a page shows one of its fullscreen routes (`NgDocFullscreenRouteService`), only the page
 * is shown: the navbar, the sidebar, the footer and the skip link are hidden.
 *
 * While it is shown, the router scrolls anchors below the navbar (the scroll offset of
 * `ViewportScroller`), and the keyboard shortcuts of the documentation work
 * (`NgDocShortcutsService`). When it is destroyed, for example when the reader leaves
 * documentation served under a route, the previous scroll offset comes back and the shortcuts
 * stop. Without navbar content, it renders no header.
 */
@Component({
  selector: 'ng-doc-root',
  templateUrl: './root.component.html',
  styleUrls: ['./root.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocSidenavComponent, PolymorpheusOutlet],
  host: {
    '[attr.data-ng-doc-no-width-limit]': 'noWidthLimit()',
    '[attr.data-ng-doc-fullscreen-route]': 'fullscreenRoute.active()',
  },
})
export class NgDocRootComponent {
  protected readonly texts: NgDocNavigationTexts = inject(NG_DOC_TEXTS).navigation;

  /**
   * If `true` then the sidebar will be shown
   * You can use it for example for landing page to hide sidebar
   */
  readonly sidebar = input<boolean, unknown>(true, { transform: booleanAttribute });

  /**
   * Content for footer
   */
  readonly footerContent = input<NgDocContent>('');

  /**
   * If `true` then page will be shown without width limit.
   * You can use it for example for landing page
   */
  readonly noWidthLimit = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected readonly sidebarService = inject(NgDocSidebarService);
  protected readonly fullscreenRoute = inject(NgDocFullscreenRouteService);
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly sidenavQuery = viewChild(NgDocSidenavComponent);

  constructor() {
    const stopShortcuts = inject(NgDocShortcutsService).listen();
    const restoreScrollOffset = this.setScrollOffset();

    inject(DestroyRef).onDestroy(() => {
      stopShortcuts();
      restoreScrollOffset();
    });
  }

  /**
   * The sidenav that holds the sidebar and the page.
   */
  get sidenav(): NgDocSidenavComponent | undefined {
    return this.sidenavQuery();
  }

  /**
   * Moves keyboard focus to the page content, as the skip link does.
   * @param event - The click on the skip link; its navigation to a fragment is cancelled.
   */
  skipToContent(event?: Event): void {
    event?.preventDefault();
    this.document.getElementById('ng-doc-content')?.focus();
  }

  /**
   * Makes the router scroll anchors below the layout's header, and below an application header
   * that the layout makes room for.
   * @returns A function that restores the previous offset, unless it was changed since.
   */
  private setScrollOffset(): () => void {
    const viewport = inject(ViewportScroller);
    // `BrowserViewportScroller` keeps the offset in a field; the server's scroller has none.
    const read = (): unknown => (viewport as unknown as { offset?: unknown }).offset;
    const previous = read();
    const offset: NgDocScrollOffset = () => [0, SCROLL_OFFSET + this.layoutTop()];

    viewport.setOffset(offset);

    return () => {
      if (read() === offset) {
        viewport.setOffset(
          typeof previous === 'function' ? (previous as NgDocScrollOffset) : [0, 0],
        );
      }
    };
  }

  /** The layout's top offset in pixels, read from the margin it gives the page area. */
  private layoutTop(): number {
    const main = this.host.querySelector(':scope > .ng-doc-root-wrapper > main');
    const view = this.document.defaultView;

    return (main && view && parseFloat(view.getComputedStyle(main).marginTop)) || 0;
  }
}
