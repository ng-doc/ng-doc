import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  ɵisNgDocDemoSizeMessage,
  ɵisNgDocPlaygroundFrameMessage,
  ɵNgDocPlaygroundFrameMessage,
} from '@ng-doc/app/demo-app';
import type { NgDocDemoTexts } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';

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
  protected readonly texts: NgDocDemoTexts = inject(NG_DOC_TEXTS).demo;

  /** The URL of the demo page, relative to the document or absolute on its origin. */
  readonly src = input.required<string>();

  /** The accessible title of the iframe. */
  readonly frameTitle = input.required<string>();

  /** Whether the iframe fills its container instead of taking the demo's height (fullscreen). */
  readonly fill = input<boolean>(false);

  /**
   * The URL fragment of the demo page, without `#` (the state of an isolated playground). The
   * iframe loads with the fragment it has when the iframe is created; a later fragment replaces
   * the page's location (`location.replace`), which reloads nothing and adds no history entry.
   */
  readonly fragment = input<string | undefined>(undefined);

  /** The messages of an isolated playground's page, from this iframe only. */
  readonly playgroundMessage = output<ɵNgDocPlaygroundFrameMessage>();

  /**
   * The page of an isolated playground (a frame with a `fragment`) loaded but sent no message of
   * the playground within 10 seconds, such as a page the build didn't make.
   */
  readonly playgroundSilent = output<void>();

  /** The height the demo reported, in pixels. */
  readonly height = signal<number | undefined>(undefined);

  /** `loading` until the demo reports its size, then `ready`; `failed` when it never does. */
  readonly state: Signal<'loading' | 'ready' | 'failed'> = computed(() =>
    this.height() !== undefined ? 'ready' : this.failed() ? 'failed' : 'loading',
  );

  /** Whether the iframe exists: only in the browser, after the first render. */
  protected readonly created = signal(false);

  /** The demo page's URL for the iframe, with the fragment the iframe was created with. */
  protected readonly frameSrc: Signal<SafeResourceUrl> = computed(() =>
    // The URL comes from the generated demo route and the demo's name: a page of this site.
    this.sanitizer.bypassSecurityTrustResourceUrl(withFragment(this.src(), this.initialFragment)),
  );

  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly failed = signal(false);
  private readonly loaded = signal(false);
  private initialFragment?: string;
  private shownFragment?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private silenceTimer?: ReturnType<typeof setTimeout>;
  private answered = false;

  constructor() {
    afterNextRender(() => {
      // Read once: a fragment that changes later must not change the iframe's `src`, which would
      // navigate it and add a history entry.
      this.initialFragment = this.shownFragment = untracked(this.fragment);
      this.created.set(true);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.silenceTimer);
    });
    effect(() => {
      const fragment = this.fragment();
      const window = this.loaded() ? this.frame()?.nativeElement.contentWindow : undefined;

      if (!window || fragment === this.shownFragment) return;
      this.shownFragment = fragment;
      // Always with `#`: going from a fragment to none would load the page again.
      window.location.replace(`${withFragment(this.src(), undefined)}#${fragment ?? ''}`);
    });
  }

  /**
   * Waits for the demo's size once its page has loaded.
   * @internal
   */
  protected onLoad(): void {
    this.loaded.set(true);
    clearTimeout(this.timer);
    clearTimeout(this.silenceTimer);
    if (untracked(this.fragment) !== undefined && !this.answered) {
      this.silenceTimer = setTimeout(
        () => this.answered || this.playgroundSilent.emit(),
        READY_TIMEOUT_MS,
      );
    }
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
      event.origin !== new URL(frame.src, frame.baseURI).origin
    ) {
      return;
    }
    if (ɵisNgDocPlaygroundFrameMessage(event.data)) {
      this.answered = true;
      clearTimeout(this.silenceTimer);
      this.playgroundMessage.emit(event.data);
      return;
    }
    if (!ɵisNgDocDemoSizeMessage(event.data)) return;
    // The first message comes before the demo has rendered, with no height yet.
    if (event.data.height === 0 && this.height() === undefined) return;
    clearTimeout(this.timer);
    this.failed.set(false);
    this.height.set(event.data.height);
  }
}

/**
 * A URL with another fragment.
 * @param url - A URL, relative or absolute.
 * @param fragment - The fragment without `#`, or none.
 */
function withFragment(url: string, fragment: string | undefined): string {
  const base = url.replace(/#.*$/, '');

  return fragment ? `${base}#${fragment}` : base;
}
