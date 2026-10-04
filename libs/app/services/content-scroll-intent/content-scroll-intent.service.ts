import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, Service, Signal, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  Scroll,
} from '@angular/router';
import { Subscription } from 'rxjs';

/** The fragment of the application's first navigation, kept until a page replays or drops it. */
export interface NgDocInitialContentScrollIntent {
  /** The decoded fragment of the navigation. */
  readonly anchor: string;
  /** Id of the navigation that produced the fragment. */
  readonly navigationId: number;
  /** The URL after redirects. */
  readonly url: string;
}

/** Captures the public initial-navigation facts that are unavailable after component activation. */
@Service()
export class NgDocContentScrollIntent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  private candidate?: { eligible: boolean; navigationId: number };
  private intent?: NgDocInitialContentScrollIntent;
  private readonly listeners = new Set<
    (intent: NgDocInitialContentScrollIntent | undefined) => void
  >();
  private started = false;
  private successful = false;
  private subscription?: Subscription;
  private readonly intentState = signal<NgDocInitialContentScrollIntent | undefined>(undefined);

  /**
   * The pending initial intent as a signal, the same value `subscribe()` listeners receive.
   */
  readonly currentIntent: Signal<NgDocInitialContentScrollIntent | undefined> =
    this.intentState.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  /** Starts following router events. Does nothing on the server or when already started. */
  start(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    this.subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.navigationStarted(event);
      else if (event instanceof NavigationEnd) this.navigationEnded(event);
      else if (event instanceof Scroll) this.scrolled(event);
      else if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        if (this.candidate && event.id >= this.candidate.navigationId) this.candidate = undefined;
        if (this.intent && event.id >= this.intent.navigationId) this.publish(undefined);
      }
    });
  }

  /**
   * Calls the listener with every change of the intent, and at once with the pending one.
   * @param listener - Receives the intent, or `undefined` once it is consumed or cancelled.
   * @returns A function that removes the listener.
   */
  subscribe(listener: (intent: NgDocInitialContentScrollIntent | undefined) => void): () => void {
    this.listeners.add(listener);
    if (this.intent) listener(this.intent);
    return () => this.listeners.delete(listener);
  }

  /**
   * Consumes the current fallback after its page has either replayed or explicitly yielded it.
   * @param navigationId - The navigation of the intent to consume.
   */
  settle(navigationId: number): void {
    if (this.intent?.navigationId === navigationId) this.publish(undefined);
  }

  private navigationStarted(event: NavigationStart): void {
    this.publish(undefined);
    const navigation = this.router.currentNavigation();
    this.candidate = {
      navigationId: event.id,
      eligible:
        !this.successful &&
        event.navigationTrigger === 'imperative' &&
        event.restoredState == null &&
        navigation?.id === event.id &&
        navigation.previousNavigation === null &&
        navigation.extras.scroll !== 'manual',
    };
  }

  private navigationEnded(event: NavigationEnd): void {
    const candidate = this.candidate;
    this.candidate = undefined;
    this.successful = true;
    if (!candidate?.eligible || candidate.navigationId !== event.id) return;
    const anchor = this.router.parseUrl(event.urlAfterRedirects).fragment;
    if (anchor) {
      this.publish({ anchor, navigationId: event.id, url: event.urlAfterRedirects });
    }
  }

  private scrolled(event: Scroll): void {
    if (this.intent && event.routerEvent.id >= this.intent.navigationId) this.publish(undefined);
    if (this.candidate && event.routerEvent.id >= this.candidate.navigationId) {
      this.candidate = undefined;
    }
  }

  private publish(intent: NgDocInitialContentScrollIntent | undefined): void {
    if (this.intent === intent) return;
    this.intent = intent;
    this.intentState.set(intent);
    for (const listener of [...this.listeners]) listener(intent);
  }

  private destroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.candidate = undefined;
    this.intent = undefined;
    this.intentState.set(undefined);
    this.listeners.clear();
  }
}
