import {
  AfterViewInit,
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { tooltipCloseAnimation, tooltipOpenAnimation } from '@ng-doc/ui-kit/animations';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes/overlay-ref';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { ngDocZoneDetach, ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services';
import { NgDocOverlayStrategy } from '@ng-doc/ui-kit/services/overlay-strategy';
import { BaseElement, NgDocContent, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import { NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';
import { EMPTY, fromEvent, merge, timer } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';

@Directive({
  selector: '[ngDocTooltip]',
  exportAs: 'ngDocTooltip',
  standalone: true,
})
export class NgDocTooltipDirective implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly overlayService = inject(NgDocOverlayService);
  private readonly ngZone = inject(NgZone);
  private readonly scrollStrategy = inject(NgDocOverlayStrategy);

  @Input('ngDocTooltip')
  content: NgDocContent = '';

  @Input()
  delay: number = 1000;

  @Input()
  displayOrigin?: BaseElement<HTMLElement>;

  @Input()
  pointerOrigin?: BaseElement<HTMLElement>;

  @Input()
  positions: NgDocOverlayPosition | NgDocOverlayPosition[] = [
    'top-center',
    'bottom-center',
    'right-center',
    'left-center',
  ];

  @Input()
  canOpen: boolean = true;

  @Input()
  panelClass: string | string[] = '';

  @Input()
  minHeight: number | string = '';

  @Input()
  maxHeight: number | string = '';

  @Input()
  height: number | string = '';

  @Input()
  minWidth: number | string = '';

  @Input()
  maxWidth: number | string = '';

  @Input()
  width: number | string = '';

  @Output()
  beforeOpen: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  afterOpen: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  beforeClose: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  afterClose: EventEmitter<void> = new EventEmitter<void>();

  overlayRef: NgDocOverlayRef | null = null;

  private readonly destroyRef = inject(DestroyRef);

  constructor() {}

  ngAfterViewInit(): void {
    // Opens tooltip with delay
    fromEvent(this.pointerOriginElement, 'mouseenter')
      .pipe(
        filter(() => this.canOpen && !this.isOpened),
        switchMap(() =>
          timer(this.delay).pipe(takeUntil(fromEvent(this.pointerOriginElement, 'mouseleave'))),
        ),
        ngDocZoneOptimize(this.ngZone),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.show());

    // Closes tooltip when mouseleave was fired, and cancel closing if mouseenter was happened
    merge(
      fromEvent(this.pointerOriginElement, 'mouseleave'),
      this.beforeOpen.pipe(
        switchMap(() =>
          isPresent(this.overlayRef)
            ? fromEvent(this.overlayRef.overlayRef.overlayElement, 'mouseleave')
            : EMPTY,
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
        ngDocZoneOptimize(this.ngZone),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.hide());
  }

  show(): void {
    if (!this.isOpened) {
      this.overlayRef = this.overlayService.open(this.content, {
        origin: this.displayOriginElement,
        overlayContainer: NgDocOverlayContainerComponent,
        positionStrategy: this.overlayService.connectedPositionStrategy(
          this.displayOriginElement,
          this.getPositions(this.positions),
        ),
        viewContainerRef: this.viewContainerRef,
        withPointer: true,
        contactBorder: true,
        panelClass: ['ng-doc-tooltip', ...asArray(this.panelClass)],
        height: this.height,
        width: this.width,
        minHeight: this.minHeight,
        minWidth: this.minWidth,
        maxHeight: this.maxHeight,
        maxWidth: this.maxWidth,
        scrollStrategy: this.scrollStrategy,
        disposeOnRouteNavigation: true,
        openAnimation: tooltipOpenAnimation,
        closeAnimation: tooltipCloseAnimation,
      });
      this.beforeOpen.emit();

      this.overlayRef
        ?.afterOpen()
        .pipe(ngDocZoneDetach(this.ngZone))
        .subscribe(() => this.afterOpen.emit());

      this.overlayRef
        ?.beforeClose()
        .pipe(ngDocZoneDetach(this.ngZone))
        .subscribe(() => this.beforeClose.emit());

      this.overlayRef
        ?.afterClose()
        .pipe(ngDocZoneDetach(this.ngZone))
        .subscribe(() => this.afterClose.emit());

      this.overlayRef?.beforeClose().subscribe(() => this.hide());

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
    if (this.overlayRef) {
      this.overlayRef.overlayRef.dispose();
    }
  }

  private get pointerOriginElement(): HTMLElement {
    return isPresent(this.pointerOrigin)
      ? toElement(this.pointerOrigin)
      : toElement(this.elementRef);
  }

  private get displayOriginElement(): HTMLElement {
    return isPresent(this.displayOrigin)
      ? toElement(this.displayOrigin)
      : toElement(this.elementRef);
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
