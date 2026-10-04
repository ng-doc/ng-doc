import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NgDocSearchComponent } from '@ng-doc/app/components/search';
import { NgDocSidebarService } from '@ng-doc/app/services/sidebar';
import { NgDocButtonIconComponent } from '@ng-doc/ui-kit';

/**
 * Navbar of the NgDoc application: the header bar above the sidebar and the page.
 *
 * It lays out, from left to right: the menu button (only where the sidebar is an overlay), the
 * content marked with `ngDocNavbarLeft` (for example the logo), the content marked with
 * `ngDocNavbarCenter` (for example the section links, hidden at 1024px and below), the search, and
 * the content marked with `ngDocNavbarRight` (for example the theme toggle).
 * @example
 * ```html
 * <ng-doc-navbar>
 *   <a ngDocNavbarLeft routerLink="/">My library</a>
 *   <nav ngDocNavbarCenter aria-label="Primary"><a routerLink="/docs">Guides</a></nav>
 *   <ng-doc-theme-toggle ngDocNavbarRight />
 * </ng-doc-navbar>
 * ```
 */
@Component({
  selector: 'ng-doc-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocSearchComponent, NgDocButtonIconComponent],
  host: {
    '[attr.data-glass-effect]': 'glassEffect()',
    '(document:keydown.escape)': 'closeSidebar()',
  },
})
export class NgDocNavbarComponent {
  protected readonly sidebarService = inject(NgDocSidebarService);

  /**
   * Show search input
   */
  readonly search = input<boolean, unknown>(true, { transform: booleanAttribute });

  /**
   * Show the menu button that opens the sidebar where it is an overlay (900px and below).
   */
  readonly hamburger = input<boolean, unknown>(true, { transform: booleanAttribute });

  /**
   * Use glass effect for navbar
   */
  readonly glassEffect = input<boolean, unknown>(true, { transform: booleanAttribute });

  private readonly menuButton = viewChild('menuButton', { read: ElementRef<HTMLButtonElement> });

  /**
   * Closes the sidebar overlay and moves focus back to the menu button that opened it.
   */
  protected closeSidebar(): void {
    if (this.sidebarService.expandedState() && this.sidebarService.isMobile) {
      this.sidebarService.hide();
      this.menuButton()?.nativeElement.focus();
    }
  }
}
