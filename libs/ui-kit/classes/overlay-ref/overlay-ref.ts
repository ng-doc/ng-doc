import {
  ConnectedOverlayPositionChange,
  FlexibleConnectedPositionStrategy,
  OverlayRef,
} from '@angular/cdk/overlay';
import { Location } from '@angular/common';
import { afterEveryRender, AfterRenderRef, Injector, NgZone, untracked } from '@angular/core';
import { Event, NavigationEnd, Router } from '@angular/router';
import { isPresent } from '@ng-doc/core';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig, NgDocOverlayContainer } from '@ng-doc/ui-kit/interfaces';
import { fromSubscribe } from '@ng-doc/ui-kit/observables';
import { NgDocOverlayAnimationEvent } from '@ng-doc/ui-kit/types';
import { fromEvent, merge, NEVER, Observable, Subject } from 'rxjs';
import { debounceTime, filter, map, pairwise, switchMap, take, takeUntil } from 'rxjs/operators';

/**
 * A handle to an opened overlay (a dropdown, a tooltip or a dialog).
 *
 * `NgDocOverlayService.open()` creates it, and the overlay content can inject it to close itself.
 */
export class NgDocOverlayRef<T = unknown> {
  private overlayResult: T | null = null;
  private opened: boolean = true;

  /**
   * @param overlayRef - The CDK overlay that hosts the container.
   * @param overlayConfig - The configuration the overlay was opened with.
   * @param overlayContainer - The container component rendered inside the overlay.
   * @param injector - Injector the overlay uses to follow application renders. It must be able to
   * inject NgZone; the component or environment injector of the opener is enough.
   * @param router - Closes the overlay after a navigation when `disposeOnRouteNavigation` is set.
   * @param location - Closes the overlay on a location change when `disposeOnNavigation` is set.
   */
  constructor(
    readonly overlayRef: OverlayRef,
    private readonly overlayConfig: NgDocOverlayConfig,
    readonly overlayContainer: NgDocOverlayContainer,
    private readonly injector: Injector,
    private readonly router?: Router,
    private readonly location?: Location,
  ) {
    // The CDK dispatchers emit outside clicks and key presses inside the Angular zone, and a
    // zoneless application needs no zone at all, so the streams below are subscribed directly.
    if (this.overlayConfig.closeIfOutsideClick) {
      this.afterOpen()
        .pipe(
          switchMap(() => this.overlayRef.outsidePointerEvents()),
          filter((event: MouseEvent) => this.outsideClickChecker(event)),
          takeUntil(this.overlayRef.detachments()),
        )
        .subscribe(() => this.close());
    }

    if (this.overlayConfig.closeIfInnerClick) {
      fromEvent(this.overlayRef.overlayElement, 'click')
        .pipe(takeUntil(this.overlayRef.detachments()))
        .subscribe(() => this.close());
    }

    if (this.router && this.overlayConfig.disposeOnRouteNavigation) {
      this.router.events
        .pipe(
          filter((event: Event) => event instanceof NavigationEnd),
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

    const origin: unknown = toElement(this.overlayConfig.origin);

    if (origin instanceof HTMLElement) {
      this.followOrigin(origin);
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
   * @param closeResult - The value `beforeClose()` and `afterClose()` emit.
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

  /**
   * Repositions the overlay when its origin moves or resizes.
   *
   * The origin is measured after application renders rather than when the zone becomes stable,
   * which never happens in a zoneless application. The debounce timer starts outside the Angular zone so that it
   * does not trigger another change detection (and another render) in a zone.js application.
   * @param origin - The element the overlay is connected to.
   */
  private followOrigin(origin: HTMLElement): void {
    const ngZone: NgZone = this.injector.get(NgZone);
    const renders: Subject<void> = new Subject<void>();
    // `untracked` lets an overlay open from a reactive context (an effect, for example), where
    // `afterEveryRender` refuses to register.
    const afterRender: AfterRenderRef = untracked(() =>
      afterEveryRender(() => ngZone.runOutsideAngular(() => renders.next()), {
        injector: this.injector,
      }),
    );

    renders
      .pipe(
        debounceTime(10),
        map(() => origin.getBoundingClientRect()),
        pairwise(),
        filter(
          ([a, b]: [DOMRect, DOMRect]) =>
            a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height,
        ),
        takeUntil(this.overlayRef.detachments()),
      )
      .subscribe(() => this.overlayRef.updatePosition());

    this.overlayRef
      .detachments()
      .pipe(take(1))
      .subscribe(() => {
        afterRender.destroy();
        renders.complete();
      });
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
