import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostBinding,
  inject,
  Input,
  NgZone,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocSearchComponent } from '@ng-doc/app/components/search';
import { NgDocSidebarService } from '@ng-doc/app/services';
import { NgDocButtonIconComponent, NgDocIconComponent, ngDocZoneOptimize } from '@ng-doc/ui-kit';
import { WA_WINDOW } from '@ng-web-apis/common';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';
import { combineLatest, fromEvent } from 'rxjs';
import { distinctUntilChanged, map, startWith } from 'rxjs/operators';

/**
 * Navbar component for ng-doc application
 */
@Component({
  selector: 'ng-doc-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusModule, NgDocSearchComponent, NgDocButtonIconComponent, NgDocIconComponent],
})
export class NgDocNavbarComponent {
  private readonly window = inject<Window>(WA_WINDOW);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly sidebarService = inject(NgDocSidebarService);

  /**
   * Show search input
   */
  @Input()
  search: boolean = true;

  /**
   * Show hamburger button
   */
  @Input()
  hamburger: boolean = true;

  /**
   * Use glass effect for navbar
   */
  @Input()
  @HostBinding('attr.data-glass-effect')
  glassEffect: boolean = true;

  /**
   * Indicates if navbar has border
   */
  @HostBinding('class.has-border')
  hasBorder: boolean = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      combineLatest([
        fromEvent(this.window, 'scroll').pipe(
          map((e: Event) => ((e.target as Document)?.scrollingElement?.scrollTop ?? 0) > 0),
          distinctUntilChanged(),
          startWith(false),
          ngDocZoneOptimize(this.ngZone),
        ),
        this.sidebarService.isExpanded(),
      ])
        .pipe(
          map(
            ([scrolled, isExpanded]: [boolean, boolean]) =>
              scrolled || (isExpanded && this.sidebarService.isMobile),
          ),
          takeUntilDestroyed(destroyRef),
        )
        .subscribe((hasShadow: boolean) => {
          this.hasBorder = hasShadow;
          this.changeDetectorRef.markForCheck();
        });
    });
  }
}
