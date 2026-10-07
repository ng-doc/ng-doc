import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  Signal,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ɵisNgDocDemoSizeMessage } from '@ng-doc/app/demo-app';

/** How long a loaded demo page may take to report its size before the frame reports a failure. */
const READY_TIMEOUT_MS = 10_000;

/**
 * Shows a demo page of the demo application in an iframe, as tall as the demo's content: the demo
 * page reports its height with `postMessage`, and only messages from this iframe's window and
 * origin are accepted. The iframe is created in the browser after the first render (the server
 * renders a placeholder with a link to the demo page) and loads lazily. Until the demo reports its
 * size, a placeholder tells that it is loading; a demo page that loads without reporting it within
 * 10 seconds is reported as failed, with the link.
 */
@Component({
  selector: 'ng-doc-demo-frame',
  templateUrl: './demo-frame.component.html',
  styleUrls: ['./demo-frame.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-state]': 'state()',
    '[attr.data-ng-doc-fill]': 'fill()',
    '(window:message)': 'onMessage($event)',
  },
})
export class NgDocDemoFrameComponent {
  /** The URL of the demo page, relative to the document or absolute on its origin. */
  readonly src = input.required<string>();

  /** The accessible title of the iframe. */
  readonly frameTitle = input.required<string>();

  /** Whether the iframe fills its container instead of taking the demo's height (fullscreen). */
  readonly fill = input<boolean>(false);

  /** The height the demo reported, in pixels. */
  readonly height = signal<number | undefined>(undefined);

  /** `loading` until the demo reports its size, then `ready`; `failed` when it never does. */
  readonly state: Signal<'loading' | 'ready' | 'failed'> = computed(() =>
    this.height() !== undefined ? 'ready' : this.failed() ? 'failed' : 'loading',
  );

  /** Whether the iframe exists: only in the browser, after the first render. */
  protected readonly created = signal(false);

  /** The demo page's URL for the iframe. */
  protected readonly frameSrc: Signal<SafeResourceUrl> = computed(() =>
    // The URL comes from the generated demo route and the demo's name: a page of this site.
    this.sanitizer.bypassSecurityTrustResourceUrl(this.src()),
  );

  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly failed = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.created.set(true));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /**
   * Waits for the demo's size once its page has loaded.
   * @internal
   */
  protected onLoad(): void {
    clearTimeout(this.timer);
    if (this.height() !== undefined) return;
    this.timer = setTimeout(() => this.failed.set(this.height() === undefined), READY_TIMEOUT_MS);
  }

  /**
   * Takes the height a demo page reports, from this iframe only.
   * @param event - A message to the window.
   * @internal
   */
  protected onMessage(event: MessageEvent): void {
    const frame = this.frame()?.nativeElement;

    if (
      !frame?.contentWindow ||
      event.source !== frame.contentWindow ||
      event.origin !== new URL(frame.src, frame.baseURI).origin ||
      !ɵisNgDocDemoSizeMessage(event.data)
    ) {
      return;
    }
    // The first message comes before the demo has rendered, with no height yet.
    if (event.data.height === 0 && this.height() === undefined) return;
    clearTimeout(this.timer);
    this.failed.set(false);
    this.height.set(event.data.height);
  }
}
