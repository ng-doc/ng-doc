import { DOCUMENT, isPlatformBrowser, ViewportScroller } from '@angular/common';
import {
  ApplicationRef,
  DestroyRef,
  ElementRef,
  inject,
  Injectable,
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { NavigationEnd, NavigationSkipped, NavigationStart, Router, Scroll } from '@angular/router';
import {
  NgDocContentScrollIntent,
  NgDocInitialContentScrollIntent,
} from '@ng-doc/app/services/content-scroll-intent';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import {
  NG_DOC_CONTENT_ANCHOR_SCROLLING,
  NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION,
} from '@ng-doc/app/tokens';
import { Subscription } from 'rxjs';

type PendingScroll = {
  armed: boolean;
  readonly navigationId: number;
  observedPosition: readonly [number, number];
  readonly sequence: number;
  readonly url: string;
  scheduled: boolean;
} & (
  | { readonly kind: 'anchor'; readonly anchor: string; readonly initial: boolean }
  | { readonly kind: 'position'; readonly position: [number, number] }
);

interface FrameWait {
  first?: number;
  second?: number;
  settle(value: boolean): void;
}

interface OverflowAnchorLease {
  readonly owners: Set<object>;
  readonly previousPriority: string;
  readonly previousValue: string;
}

const overflowAnchorLeases = new WeakMap<HTMLElement, OverflowAnchorLease>();

/** Coordinates one missed router anchor with the accepted asynchronous content pass. */
@Injectable()
export class NgDocContentAnchorController {
  private readonly applicationRef = inject(ApplicationRef);
  private readonly document = inject(DOCUMENT);
  private readonly contentState = inject(NgDocContentState);
  private readonly initialScrollIntent = inject(NgDocContentScrollIntent);
  private readonly anchorScrolling = inject(NG_DOC_CONTENT_ANCHOR_SCROLLING);
  private readonly positionRestoration = inject(NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportScroller);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private active = false;
  private bodyProcessed = false;
  private destroyed = false;
  private latestNavigationId = 0;
  private pending?: PendingScroll;
  private sequence = 0;
  private readonly subscription: Subscription;
  private viewportListening = false;
  private frameWait?: FrameWait;
  private overflowAnchorLease?: { readonly element: HTMLElement; readonly owner: object };
  private suppressedNavigationId?: number;
  private unsubscribeIntent?: () => void;
  private readonly userInput = () => {
    if (this.latestNavigationId > 0) this.suppressedNavigationId = this.latestNavigationId;
    if (this.pending) this.clear();
  };
  private readonly keyInput = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) this.userInput();
  };
  private readonly viewportScroll = () => {
    if (
      this.pending &&
      this.pending.armed &&
      !samePosition(this.viewport.getScrollPosition(), this.pending.observedPosition)
    ) {
      this.userInput();
    }
  };

  constructor() {
    this.subscription = this.router.events.subscribe((event) => {
      if (event instanceof Scroll) this.observeScroll(event);
      else if (event instanceof NavigationStart) {
        this.latestNavigationId = Math.max(this.latestNavigationId, event.id);
        this.suppressedNavigationId = undefined;
        this.clear();
      }
    });
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  /** Limits delayed replay to pages backed by an asynchronous content source. */
  activate(): void {
    this.active = true;
    this.unsubscribeIntent ??= this.initialScrollIntent.subscribe((intent) =>
      this.observeInitialIntent(intent),
    );
    if (
      (this.anchorScrolling || this.positionRestoration === 'enabled') &&
      this.browser &&
      this.document.defaultView &&
      !this.viewportListening
    ) {
      this.viewportListening = true;
      this.document.defaultView.addEventListener('scroll', this.viewportScroll, {
        capture: true,
        passive: true,
      });
      this.document.defaultView.addEventListener('wheel', this.userInput, { passive: true });
      this.document.defaultView.addEventListener('touchmove', this.userInput, { passive: true });
      this.document.defaultView.addEventListener('keydown', this.keyInput);
    }
  }

  /** Marks the current asynchronous body and its processors as accepted. */
  contentProcessed(): void {
    this.bodyProcessed = true;
    const pending = this.pending;
    if (!pending || !pending.armed || pending.scheduled) return;
    pending.scheduled = true;
    void this.replayAfterStable(pending);
  }

  /** Cancels a missed anchor when the current body fails. */
  contentFailed(): void {
    this.bodyProcessed = false;
    this.clear();
  }

  private observeScroll(event: Scroll): void {
    if (event.routerEvent.id < this.latestNavigationId) return;
    this.latestNavigationId = event.routerEvent.id;
    this.clear();
    if (this.suppressedNavigationId === event.routerEvent.id) return;
    const sequence = ++this.sequence;
    if (
      !this.active ||
      !this.browser ||
      event.scrollBehavior === 'manual' ||
      (event.position && this.positionRestoration !== 'enabled')
    ) {
      return;
    }

    const observedPosition = this.viewport.getScrollPosition();
    if (event.position) {
      if (samePosition(observedPosition, event.position)) return;
      this.pending = {
        armed: false,
        kind: 'position',
        navigationId: event.routerEvent.id,
        observedPosition,
        position: [event.position[0], event.position[1]],
        sequence,
        url: this.eventUrl(event.routerEvent),
        scheduled: false,
      };
      const pending = this.pending;
      this.acquireOverflowAnchor(pending);
      queueMicrotask(() => {
        if (this.destroyed || this.pending !== pending || pending.sequence !== this.sequence)
          return;
        pending.observedPosition = this.viewport.getScrollPosition();
        pending.armed = true;
        if (samePosition(pending.observedPosition, pending.position)) {
          this.clear();
        } else if (this.bodyProcessed) {
          this.contentProcessed();
        }
      });
      return;
    }
    if (!this.anchorScrolling || !event.anchor || this.target(event.anchor)) return;

    this.pending = {
      armed: true,
      kind: 'anchor',
      anchor: event.anchor,
      initial: false,
      navigationId: event.routerEvent.id,
      observedPosition,
      sequence,
      url: this.eventUrl(event.routerEvent),
      scheduled: false,
    };
    if (this.bodyProcessed) this.contentProcessed();
  }

  private async replayAfterStable(pending: PendingScroll): Promise<void> {
    try {
      await this.applicationRef.whenStable();
    } catch {
      if (this.pending === pending) this.clear();
      return;
    }
    if (this.destroyed || this.pending !== pending || pending.sequence !== this.sequence) return;
    if (pending.kind === 'anchor' && pending.initial && !(await this.afterScrollOpportunity())) {
      return;
    }
    if (this.destroyed || this.pending !== pending || pending.sequence !== this.sequence) return;

    const target = pending.kind === 'anchor' ? this.target(pending.anchor) : undefined;
    const position = this.viewport.getScrollPosition();
    this.pending = undefined;
    if (pending.kind === 'anchor' && pending.initial) {
      this.initialScrollIntent.settle(pending.navigationId);
    }
    try {
      if (
        this.router.url !== pending.url ||
        pending.navigationId !== this.latestNavigationId ||
        this.contentState.currentFailure() ||
        (pending.kind === 'anchor' && !target) ||
        !samePosition(position, pending.observedPosition)
      ) {
        return;
      }
      if (pending.kind === 'anchor') {
        this.viewport.scrollToAnchor(pending.anchor);
      } else this.viewport.scrollToPosition(pending.position);
    } finally {
      this.releaseOverflowAnchor(pending);
    }
  }

  private observeInitialIntent(intent: NgDocInitialContentScrollIntent | undefined): void {
    if (this.pending?.kind === 'anchor' && this.pending.initial) this.clear();
    if (
      !intent ||
      !this.active ||
      !this.browser ||
      !this.anchorScrolling ||
      this.suppressedNavigationId === intent.navigationId
    ) {
      return;
    }
    if (this.target(intent.anchor)) {
      this.initialScrollIntent.settle(intent.navigationId);
      return;
    }
    this.pending = {
      armed: true,
      kind: 'anchor',
      anchor: intent.anchor,
      initial: true,
      navigationId: intent.navigationId,
      observedPosition: this.viewport.getScrollPosition(),
      sequence: ++this.sequence,
      url: intent.url,
      scheduled: false,
    };
    this.latestNavigationId = Math.max(this.latestNavigationId, intent.navigationId);
    if (this.bodyProcessed) this.contentProcessed();
  }

  private afterScrollOpportunity(): Promise<boolean> {
    const window = this.document.defaultView;
    if (!window) return Promise.resolve(false);
    this.cancelFrameWait();
    return this.zone.runOutsideAngular(
      () =>
        new Promise<boolean>((resolve) => {
          const wait: FrameWait = {
            settle: (value: boolean) => {
              if (this.frameWait !== wait) return;
              this.frameWait = undefined;
              resolve(value);
            },
          };
          this.frameWait = wait;
          wait.first = window.requestAnimationFrame(() => {
            wait.first = undefined;
            wait.second = window.requestAnimationFrame(() => {
              wait.second = undefined;
              wait.settle(true);
            });
          });
        }),
    );
  }

  private eventUrl(event: NavigationEnd | NavigationSkipped): string {
    return event instanceof NavigationEnd ? event.urlAfterRedirects : event.url;
  }

  private target(anchor: string): Element | undefined {
    const scope = this.pageWrapper();
    if (!scope || scope.ownerDocument !== this.document) return undefined;
    const local =
      scope.id === anchor || scope.getAttribute('name') === anchor
        ? scope
        : Array.from(scope.querySelectorAll('[id], [name]')).find(
            (element) => element.id === anchor || element.getAttribute('name') === anchor,
          );
    const global =
      this.document.getElementById(anchor) ?? this.document.getElementsByName(anchor)[0];
    return local && global === local ? local : undefined;
  }

  private clear(): void {
    const pending = this.pending;
    this.cancelFrameWait();
    this.sequence++;
    this.pending = undefined;
    if (pending) this.releaseOverflowAnchor(pending);
    if (pending?.kind === 'anchor' && pending.initial) {
      this.initialScrollIntent.settle(pending.navigationId);
    }
  }

  private acquireOverflowAnchor(owner: object): void {
    const element = this.pageWrapper();
    if (!element) return;
    let lease = overflowAnchorLeases.get(element);
    if (!lease) {
      lease = {
        owners: new Set(),
        previousPriority: element.style.getPropertyPriority('overflow-anchor'),
        previousValue: element.style.getPropertyValue('overflow-anchor'),
      };
      overflowAnchorLeases.set(element, lease);
      element.style.setProperty('overflow-anchor', 'none');
    }
    lease.owners.add(owner);
    this.overflowAnchorLease = { element, owner };
  }

  private releaseOverflowAnchor(owner: object): void {
    const current = this.overflowAnchorLease;
    if (!current || current.owner !== owner) return;
    this.overflowAnchorLease = undefined;
    const lease = overflowAnchorLeases.get(current.element);
    if (!lease) return;
    lease.owners.delete(owner);
    if (lease.owners.size > 0) return;
    overflowAnchorLeases.delete(current.element);
    if (
      current.element.style.getPropertyValue('overflow-anchor') !== 'none' ||
      current.element.style.getPropertyPriority('overflow-anchor') !== ''
    ) {
      return;
    }
    if (lease.previousValue) {
      current.element.style.setProperty(
        'overflow-anchor',
        lease.previousValue,
        lease.previousPriority,
      );
    } else {
      current.element.style.removeProperty('overflow-anchor');
    }
  }

  private pageWrapper(): HTMLElement | undefined {
    return this.host.closest<HTMLElement>('ng-doc-page-wrapper') ?? undefined;
  }

  private cancelFrameWait(): void {
    const wait = this.frameWait;
    if (!wait) return;
    const window = this.document.defaultView;
    if (wait.first !== undefined) window?.cancelAnimationFrame(wait.first);
    if (wait.second !== undefined) window?.cancelAnimationFrame(wait.second);
    wait.settle(false);
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    if (this.viewportListening) {
      this.document.defaultView?.removeEventListener('scroll', this.viewportScroll, true);
      this.document.defaultView?.removeEventListener('wheel', this.userInput);
      this.document.defaultView?.removeEventListener('touchmove', this.userInput);
      this.document.defaultView?.removeEventListener('keydown', this.keyInput);
      this.viewportListening = false;
    }
    this.unsubscribeIntent?.();
    this.unsubscribeIntent = undefined;
    this.subscription.unsubscribe();
  }
}

const SCROLL_KEYS = new Set([
  ' ',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

function samePosition(
  first: readonly [number, number],
  second: readonly [number, number],
): boolean {
  return first[0] === second[0] && first[1] === second[1];
}
