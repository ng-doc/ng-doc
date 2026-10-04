import {
  AfterViewInit,
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  output,
  untracked,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { tooltipCloseAnimation, tooltipOpenAnimation } from '@ng-doc/ui-kit/animations';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes/overlay-ref';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services';
import { NgDocOverlayStrategy } from '@ng-doc/ui-kit/services/overlay-strategy';
import { BaseElement, NgDocContent, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import { NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';
import { EMPTY, fromEvent, merge, Subject, timer } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';

/** Shows its content in a tooltip while the pointer rests on the host. */
@Directive({
  selector: '[ngDocTooltip]',
  exportAs: 'ngDocTooltip',
})
export class NgDocTooltipDirective implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly overlayService = inject(NgDocOverlayService);
  private readonly ngZone = inject(NgZone);
  private readonly scrollStrategy = inject(NgDocOverlayStrategy);
  private readonly destroyRef = inject(DestroyRef);

  /** What the tooltip renders: a string, a template or a component. */
  readonly content = input<NgDocContent>('', { alias: 'ngDocTooltip' });

  /** Milliseconds the pointer rests on the host before the tooltip opens. */
  readonly delay = input<number>(500);

  /** The element the tooltip points at; the host by default. */
  readonly displayOrigin = input<BaseElement<HTMLElement>>();

  /** The element whose hover opens the tooltip; the host by default. Read once, after the view. */
  readonly pointerOrigin = input<BaseElement<HTMLElement>>();

  readonly positions = input<NgDocOverlayPosition | NgDocOverlayPosition[]>([
    'top-center',
    'bottom-center',
    'right-center',
    'left-center',
  ]);

  /** Whether hovering opens the tooltip. */
  readonly canOpen = input<boolean>(true);

  readonly panelClass = input<string | string[]>('');

  readonly minHeight = input<number | string>('');

  readonly maxHeight = input<number | string>('');

  readonly height = input<number | string>('');

  readonly minWidth = input<number | string>('');

  readonly maxWidth = input<number | string>('');

  readonly width = input<number | string>('');

  /** Emits when the tooltip starts opening. */
  readonly beforeOpen = output<void>();

  /** Emits when the open animation has finished. */
  readonly afterOpen = output<void>();

  /** Emits when the tooltip starts closing. */
  readonly beforeClose = output<void>();

  /** Emits when the tooltip has closed. */
  readonly afterClose = output<void>();

  overlayRef: NgDocOverlayRef | null = null;

  private readonly opened$: Subject<NgDocOverlayRef> = new Subject<NgDocOverlayRef>();

  // The last opened overlay. hide() clears `overlayRef` at once, while the overlay stays attached
  // until its close animation ends; destroying the directive disposes it.
  private lastOverlayRef: NgDocOverlayRef | null = null;

  ngAfterViewInit(): void {
    // Pointer events are frequent, so they are observed outside the Angular zone; only opening
    // and closing re-enter it. Opening and closing work through signals and markForCheck, so a
    // zoneless application renders them as well.
    this.ngZone.runOutsideAngular(() => {
      // Opens the tooltip after the delay, unless the pointer leaves first
      fromEvent(this.pointerOriginElement, 'mouseenter')
        .pipe(
          filter(() => this.canOpen() && !this.isOpened),
          switchMap(() =>
            timer(this.delay()).pipe(takeUntil(fromEvent(this.pointerOriginElement, 'mouseleave'))),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.ngZone.run(() => this.show()));

      // Closes the tooltip when the pointer leaves the host or the tooltip, unless it comes back
      // to either of them within 50 ms
      merge(
        fromEvent(this.pointerOriginElement, 'mouseleave'),
        this.opened$.pipe(
          switchMap((overlayRef: NgDocOverlayRef) =>
            fromEvent(overlayRef.overlayRef.overlayElement, 'mouseleave'),
          ),
        ),
      )
        .pipe(
          filter(() => this.isOpened),
          switchMap(() =>
            timer(50).pipe(
              takeUntil(fromEvent(this.pointerOriginElement, 'mouseenter')),
              takeUntil(
                isPresent(this.overlayRef)
                  ? fromEvent(this.overlayRef.overlayRef.overlayElement, 'mouseenter')
                  : EMPTY,
              ),
            ),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.ngZone.run(() => this.hide()));
    });
  }

  show(): void {
    // Opening reads the inputs; `untracked` keeps an effect that calls show() from depending on
    // them.
    untracked(() => this.open());
  }

  private open(): void {
    if (!this.isOpened) {
      const overlayRef: NgDocOverlayRef = this.overlayService.open(this.content(), {
        origin: this.displayOriginElement,
        overlayContainer: NgDocOverlayContainerComponent,
        positionStrategy: this.overlayService.connectedPositionStrategy(
          this.displayOriginElement,
          this.getPositions(this.positions()),
        ),
        viewContainerRef: this.viewContainerRef,
        withPointer: true,
        contactBorder: true,
        panelClass: ['ng-doc-tooltip', ...asArray(this.panelClass())],
        height: this.height(),
        width: this.width(),
        minHeight: this.minHeight(),
        minWidth: this.minWidth(),
        maxHeight: this.maxHeight(),
        maxWidth: this.maxWidth(),
        scrollStrategy: this.scrollStrategy,
        disposeOnRouteNavigation: true,
        openAnimation: tooltipOpenAnimation,
        closeAnimation: tooltipCloseAnimation,
      });

      this.overlayRef = overlayRef;
      this.lastOverlayRef = overlayRef;
      this.beforeOpen.emit();
      // The tooltip closes when the pointer leaves it; its element exists only once it is open.
      this.ngZone.runOutsideAngular(() => this.opened$.next(overlayRef));

      // The animations can finish after the directive is destroyed; its outputs must not emit
      // then.
      overlayRef
        .afterOpen()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.afterOpen.emit());
      overlayRef
        .beforeClose()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.beforeClose.emit();
          this.hide();
        });
      overlayRef
        .afterClose()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.afterClose.emit());

      this.changeDetectorRef.markForCheck();
    }
  }

  hide(): void {
    if (this.isOpened) {
      this.overlayRef?.close();
      this.overlayRef = null;
      this.changeDetectorRef.markForCheck();
    }
  }

  get isOpened(): boolean {
    return !!this.overlayRef;
  }

  ngOnDestroy(): void {
    this.lastOverlayRef?.overlayRef.dispose();
  }

  private get pointerOriginElement(): HTMLElement {
    const pointerOrigin: BaseElement<HTMLElement> | undefined = this.pointerOrigin();

    return isPresent(pointerOrigin) ? toElement(pointerOrigin) : toElement(this.elementRef);
  }

  private get displayOriginElement(): HTMLElement {
    const displayOrigin: BaseElement<HTMLElement> | undefined = this.displayOrigin();

    return isPresent(displayOrigin) ? toElement(displayOrigin) : toElement(this.elementRef);
  }

  private getPositions(
    positions: NgDocOverlayPosition | NgDocOverlayPosition[],
  ): NgDocOverlayPosition[] {
    return NgDocOverlayUtils.getConnectedPosition(
      !!positions && asArray(positions).length
        ? positions
        : ['bottom-center', 'top-center', 'right-center', 'left-center'],
      this.displayOriginElement,
      0,
      true,
    );
  }
}
