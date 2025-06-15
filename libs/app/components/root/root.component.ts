import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  HostBinding,
  inject,
  Input,
  ViewChild,
} from '@angular/core';
import { NgDocSidebarService } from '@ng-doc/app/services';
import { NgDocContent, NgDocSidenavComponent } from '@ng-doc/ui-kit';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

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
  standalone: true,
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
  standalone: true,
})
export class NgDocCustomSidebarDirective {}

@Component({
  selector: 'ng-doc-root',
  templateUrl: './root.component.html',
  styleUrls: ['./root.component.scss'],
  providers: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocSidenavComponent, PolymorpheusModule, AsyncPipe],
})
export class NgDocRootComponent {
  /**
   * If `true` then the sidebar will be shown
   * You can use it for example for landing page to hide sidebar
   */
  @Input()
  sidebar: boolean = true;

  /**
   * Content for footer
   */
  @Input()
  footerContent: NgDocContent = '';

  /**
   * If `true` then page will be shown without width limit.
   * You can use it for example for landing page
   */
  @Input()
  @HostBinding('attr.data-ng-doc-no-width-limit')
  noWidthLimit: boolean = false;

  @ViewChild(NgDocSidenavComponent)
  sidenav?: NgDocSidenavComponent;

  protected readonly sidebarService = inject(NgDocSidebarService);
}
