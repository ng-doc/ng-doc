import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  NgZone,
  Signal,
  signal,
} from '@angular/core';

/**
 * Shows its host element fullscreen with the browser Fullscreen API.
 *
 * `supported()` stays `false` on the server and in browsers that do not allow fullscreen
 * (`document.fullscreenEnabled`), so a control that uses the directive can hide itself there.
 * `active()` follows the browser's fullscreen state, including an exit with Esc, and the host
 * gets `data-ng-doc-fullscreen="true"` while it is fullscreen.
 * @example
 * <div ngDocFullscreen #stage="ngDocFullscreen">
 *   <button (click)="stage.toggle()">{{ stage.active() ? 'Exit fullscreen' : 'Fullscreen' }}</button>
 * </div>
 */
@Directive({
  selector: '[ngDocFullscreen]',
  exportAs: 'ngDocFullscreen',
  host: {
    '[attr.data-ng-doc-fullscreen]': 'active()',
  },
})
export class NgDocFullscreenDirective {
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly supportedState = signal<boolean>(false);
  private readonly activeState = signal<boolean>(false);

  /** Whether the browser can show the host fullscreen. Always `false` on the server. */
  readonly supported: Signal<boolean> = this.supportedState.asReadonly();

  /** Whether the host is shown fullscreen. */
  readonly active: Signal<boolean> = this.activeState.asReadonly();

  constructor() {
    const ngZone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    // The Fullscreen API exists only in the browser, and the first render must match the
    // server-rendered markup, so support is detected after it.
    afterNextRender(() => {
      const sync = (): void => this.activeState.set(this.document.fullscreenElement === this.host);

      this.supportedState.set(
        !!this.document.fullscreenEnabled && typeof this.host.requestFullscreen === 'function',
      );
      sync();
      // The signal it writes schedules the render, so the listener needs no zone.
      ngZone.runOutsideAngular(() => this.document.addEventListener('fullscreenchange', sync));
      destroyRef.onDestroy(() => this.document.removeEventListener('fullscreenchange', sync));
    });
  }

  /**
   * Shows the host fullscreen. Does nothing where fullscreen is not supported, and a request the
   * browser refuses leaves the page as it is.
   */
  async enter(): Promise<void> {
    if (!this.supported() || this.active()) return;

    try {
      await this.host.requestFullscreen();
    } catch {
      // The browser refused (no user gesture, a permissions policy, or the element left the
      // document); `fullscreenchange` does not fire, so the state is still right.
    }
  }

  /** Leaves fullscreen when the host is the fullscreen element. */
  async exit(): Promise<void> {
    if (this.document.fullscreenElement !== this.host) return;

    try {
      await this.document.exitFullscreen();
    } catch {
      // Fullscreen has already ended (for example with Esc).
    }
  }

  /** Enters fullscreen, or leaves it when the host is already fullscreen. */
  toggle(): Promise<void> {
    return this.active() ? this.exit() : this.enter();
  }
}
