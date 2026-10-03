import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  Directive,
  DOCUMENT,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NgDocFullscreenRouteService } from '@ng-doc/app/services/fullscreen-route';
import { NgDocSidebarService } from '@ng-doc/app/services/sidebar';
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
 * Root layout of the NgDoc application: the navbar, the sidebar, the page and the footer.
 *
 * Its first focusable element is a "Skip to content" link, shown only while it has focus, that
 * moves keyboard focus past the navbar and the sidebar to the page.
 *
 * While a page shows one of its fullscreen routes (`NgDocFullscreenRouteService`), only the page
 * is shown: the navbar, the sidebar, the footer and the skip link are hidden.
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
  private readonly sidenavQuery = viewChild(NgDocSidenavComponent);

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
}
