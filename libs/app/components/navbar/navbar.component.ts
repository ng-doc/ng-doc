import { AsyncPipe, NgIf } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  Inject,
  Input,
  NgZone,
} from '@angular/core';
import { NgDocSearchComponent } from '@ng-doc/app/components/search';
import { NgDocSidebarService } from '@ng-doc/app/services';
import {
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocLetDirective,
  ngDocZoneOptimize,
} from '@ng-doc/ui-kit';
import { WINDOW } from '@ng-web-apis/common';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
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
  standalone: true,
  imports: [
    NgDocLetDirective,
    PolymorpheusModule,
    NgIf,
    NgDocSearchComponent,
    NgDocButtonIconComponent,
    NgDocIconComponent,
    AsyncPipe,
  ],
})
@UntilDestroy()
export class NgDocNavbarComponent {
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

  constructor(
    @Inject(WINDOW)
    private readonly window: Window,
    private readonly ngZone: NgZone,
    private readonly changeDetectorRef: ChangeDetectorRef,
    protected readonly sidebarService: NgDocSidebarService,
  ) {
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
          untilDestroyed(this),
        )
        .subscribe((hasShadow: boolean) => {
          this.hasBorder = hasShadow;
          this.changeDetectorRef.markForCheck();
        });
    });
  }
}
