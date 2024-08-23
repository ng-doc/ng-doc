import {
  ConnectedOverlayPositionChange,
  FlexibleConnectedPositionStrategy,
  OverlayRef,
} from '@angular/cdk/overlay';
import { Location } from '@angular/common';
import { NgZone } from '@angular/core';
import { Event, NavigationEnd, Router } from '@angular/router';
import { isPresent } from '@ng-doc/core';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig, NgDocOverlayContainer } from '@ng-doc/ui-kit/interfaces';
import { fromSubscribe, ngDocZoneDetach, ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import { NgDocOverlayAnimationEvent } from '@ng-doc/ui-kit/types';
import { fromEvent, merge, NEVER, Observable } from 'rxjs';
import { debounceTime, filter, map, pairwise, switchMap, take, takeUntil } from 'rxjs/operators';

export class NgDocOverlayRef<T = unknown> {
  private overlayResult: T | null = null;
  private opened: boolean = true;

  constructor(
    readonly overlayRef: OverlayRef,
    private readonly overlayConfig: NgDocOverlayConfig,
    readonly overlayContainer: NgDocOverlayContainer,
    private readonly ngZone: NgZone,
    private readonly router?: Router,
    private readonly location?: Location,
  ) {
    /* Closes overlay when it was outside click */
    this.afterOpen()
      .pipe(
        switchMap(() =>
          this.ngZone.runOutsideAngular(() => this.overlayRef.outsidePointerEvents()),
        ),
        filter(
          (event: MouseEvent) =>
            !!this.overlayConfig.closeIfOutsideClick && this.outsideClickChecker(event),
        ),
        ngDocZoneOptimize(this.ngZone),
      )
      .subscribe(() => this.close());

    /* Closes overlay when it was inner click */
    fromEvent(this.overlayRef.overlayElement, 'click')
      .pipe(
        filter(() => !!this.overlayConfig.closeIfInnerClick),
        takeUntil(this.overlayRef.detachments()),
        ngDocZoneOptimize(this.ngZone),
      )
      .subscribe(() => this.close());

    /* Closes overlay if route was changed */
    if (this.router && this.overlayConfig.disposeOnRouteNavigation) {
      this.router.events
        .pipe(
          filter((event: Event) => event instanceof NavigationEnd),
          ngDocZoneOptimize(this.ngZone),
          takeUntil(this.overlayRef.detachments()),
        )
        .subscribe(() => this.close());
    }

    if (this.location && this.overlayConfig.disposeOnNavigation) {
      fromSubscribe(this.location)
        .pipe(takeUntil(this.overlayRef.detachments()))
        .subscribe(() => this.close());
    }

    if (!this.overlayConfig.disableClose) {
      merge(
        this.overlayRef.backdropClick(),
        this.overlayRef.keydownEvents().pipe(filter((e: KeyboardEvent) => e.code === 'Escape')),
      )
        .pipe(take(1), takeUntil(this.overlayRef.detachments()))
        .subscribe(() => this.close());
    }

    /* Update position if origin changes its position */
    const origin: unknown = toElement(this.overlayConfig.origin);

    if (origin instanceof HTMLElement) {
      this.ngZone.onStable
        .pipe(
          debounceTime(10),
          map(() => origin.getBoundingClientRect()),
          pairwise(),
          filter(
            ([a, b]: [DOMRect, DOMRect]) =>
              isPresent(a) &&
              isPresent(b) &&
              (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height),
          ),
          ngDocZoneDetach(this.ngZone),
          takeUntil(this.overlayRef.detachments()),
        )
        .subscribe(() => this.overlayRef.updatePosition());
    }
  }

  /** Sets focus to overlay */
  focus(): void {
    this.overlayContainer.focus();
  }

  /** Overlay has focus */
  get isFocused(): boolean {
    return this.overlayContainer.isFocused;
  }

  /** Overlay is opened */
  get isOpened(): boolean {
    return this.opened;
  }

  /** Overlay has attached */
  get hasAttached(): boolean {
    return this.overlayRef.hasAttached();
  }

  /**
   * Closes overlay
   * @param closeResult
   */
  close(closeResult?: T): void {
    this.overlayResult = isPresent(closeResult) ? closeResult : null;
    this.afterClose().subscribe(() => void this.overlayRef.detach());
    this.overlayContainer.close();
    this.overlayRef.detachBackdrop();
    this.opened = false;
  }

  beforeOpen(): Observable<void> {
    return this.overlayContainer.animationEvent.pipe(
      filter((event: NgDocOverlayAnimationEvent) => event === 'beforeOpen'),
      take(1),
      map(() => void 0),
    );
  }

  afterOpen(): Observable<void> {
    return this.overlayContainer.animationEvent.pipe(
      filter((event: NgDocOverlayAnimationEvent) => event === 'afterOpen'),
      take(1),
      map(() => void 0),
    );
  }

  beforeClose(): Observable<T | null> {
    return merge(
      this.overlayContainer.animationEvent.pipe(
        filter((event: NgDocOverlayAnimationEvent) => event === 'beforeClose'),
      ),
      this.overlayRef.detachments(),
    ).pipe(
      take(1),
      map(() => this.overlayResult),
    );
  }

  afterClose(): Observable<T | null> {
    return merge(
      this.overlayContainer.animationEvent.pipe(
        filter((event: NgDocOverlayAnimationEvent) => event === 'afterClose'),
      ),
      this.overlayRef.detachments(),
    ).pipe(
      take(1),
      map(() => this.overlayResult),
    );
  }

  positionChanges(): Observable<ConnectedOverlayPositionChange> {
    return this.overlayConfig.positionStrategy instanceof FlexibleConnectedPositionStrategy
      ? this.overlayConfig.positionStrategy.positionChanges
      : NEVER;
  }

  private outsideClickChecker(event: MouseEvent): boolean {
    const target: EventTarget | null = event.target;
    if (target instanceof Element) {
      const origin: unknown = toElement(this.overlayConfig.origin);
      if (origin instanceof HTMLElement) {
        return !origin.contains(target);
      }
    }
    return true;
  }
}
