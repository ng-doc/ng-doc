import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { NgDocOverlayContainerComponent, NgDocOverlayService } from '@ng-doc/ui-kit';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';

/** The size of the opened image, in CSS pixels. */
interface ZoomSize {
  width: number;
  height: number;
}

/** Easing of the zoom: fast at first, settling into the final size. */
const ZOOM_EASING: string = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Wraps an image of the page: clicking it, or pressing Enter or Space on it, opens the image at
 * its natural size, scaled down to fit the window.
 *
 * An image inside a link keeps the link's behaviour, and an image with an empty `alt` is
 * decorative: neither becomes a button.
 */
@Component({
  selector: 'ng-doc-image-viewer',
  imports: [],
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'isInteractive() ? "button" : null',
    '[attr.tabindex]': 'isInteractive() ? 0 : null',
    '[attr.aria-label]': 'isInteractive() ? "Open image: " + alt() : null',
    '[attr.data-interactive]': 'isInteractive()',
    '[attr.data-opened]': 'opened()',
    '(click)': 'clickEvent()',
    '(keydown.enter)': 'clickEvent()',
    '(keydown.space)': 'onSpace($event)',
  },
})
export class NgDocImageViewerComponent {
  /** Source of the image. */
  readonly src = input.required<string>();

  /** Alternative text of the image. */
  readonly alt = input.required<string>();

  protected readonly image = viewChild.required('image', { read: TemplateRef });
  protected readonly overlay = inject(NgDocOverlayService);
  protected readonly element: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly window: Window | null = inject(DOCUMENT).defaultView;

  /** Whether the scaled image is open. */
  protected readonly opened = signal<boolean>(false);

  /** The size of the opened image. */
  protected readonly size = signal<ZoomSize>({ width: 0, height: 0 });

  protected overlayRef?: NgDocOverlayRef;

  private attempt: number = 0;
  private destroyed: boolean = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.overlayRef?.close();
    });
  }

  /**
   * Opens the image at its natural size, scaled down to fit the window, unless the image is not
   * interactive. The image grows from its place on the page.
   */
  clickEvent(): void {
    untracked(() => {
      if (this.isInteractive()) {
        void this.open();
      }
    });
  }

  /**
   * Whether the image opens: it has a text alternative and is not inside a link. The page
   * processor moves the host into place before change detection, so the check reads the DOM
   * where the image ends up.
   */
  protected isInteractive(): boolean {
    return !!this.alt().trim() && !this.element.parentElement?.closest('a');
  }

  /**
   * Opens the image on Space without scrolling the page.
   * @param event - The key press.
   */
  protected onSpace(event: Event): void {
    if (this.isInteractive()) {
      event.preventDefault();
      this.clickEvent();
    }
  }

  private async open(): Promise<void> {
    this.overlayRef?.close();

    const attempt: number = ++this.attempt;
    const thumbnail: HTMLImageElement | null = this.element.querySelector('img');

    await this.decode(thumbnail);

    // The reader may have opened the image again, pressed Escape or left the page while it
    // decoded.
    if (attempt !== this.attempt || this.destroyed) {
      return;
    }

    // The size is known before anything moves, so the image grows straight to it.
    const source: ZoomSize = this.sourceSize(thumbnail);
    const size: ZoomSize = this.fit(source);
    const zoomedFrame: Keyframe = { transformOrigin: '0 0', transform: 'none' };
    // The close animation reads its keyframes when it runs; a refit updates them in place.
    const closeFrames: Keyframe[] = [zoomedFrame, this.thumbnailFrame(thumbnail, size)];
    const animate: boolean = !this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.size.set(size);

    const overlayRef: NgDocOverlayRef = this.overlay.open(this.image(), {
      overlayContainer: NgDocOverlayContainerComponent,
      positionStrategy: this.overlay
        .globalPositionStrategy()
        .centerHorizontally()
        .centerVertically(),
      scrollStrategy: this.overlay.scrollStrategy().block(),
      hasBackdrop: true,
      backdropClass: 'ng-doc-blur-backdrop',
      width: `${size.width}px`,
      height: `${size.height}px`,
      openAnimation: animate
        ? [[closeFrames[1], zoomedFrame], { duration: 300, easing: ZOOM_EASING }]
        : undefined,
      closeAnimation: animate
        ? [closeFrames, { duration: 200, easing: ZOOM_EASING, fill: 'forwards' }]
        : undefined,
    });
    const listeners: AbortController = new AbortController();
    // A resized or rotated window fits the image again.
    const refit = (): void => {
      const fitted: ZoomSize = this.fit(source);

      this.size.set(fitted);
      overlayRef.overlayRef.updateSize({
        width: `${fitted.width}px`,
        height: `${fitted.height}px`,
      });
      closeFrames[1] = this.thumbnailFrame(thumbnail, fitted);
    };

    this.window?.addEventListener('resize', refit, { signal: listeners.signal });
    this.window?.addEventListener('orientationchange', refit, { signal: listeners.signal });

    this.overlayRef = overlayRef;
    this.opened.set(true);

    overlayRef.afterClose().subscribe(() => {
      listeners.abort();

      if (this.overlayRef === overlayRef) {
        this.overlayRef = undefined;
        this.opened.set(false);
        this.element.focus();
      }
    });
  }

  /**
   * Waits until the image is decoded, so its natural size is known. Escape cancels the open
   * meanwhile, as it closes the opened image. A failed decode (a broken or not yet available
   * image) leaves the sizes that are known.
   * @param thumbnail - The image on the page.
   */
  private async decode(thumbnail: HTMLImageElement | null): Promise<void> {
    const listeners: AbortController = new AbortController();

    this.window?.document.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.attempt++;
        }
      },
      { capture: true, signal: listeners.signal },
    );

    try {
      await thumbnail?.decode?.().catch(() => undefined);
    } finally {
      listeners.abort();
    }
  }

  /**
   * The size to scale: the natural size of the image, or the size of the thumbnail for an image
   * without one (an SVG without dimensions), which may then grow to fill the window.
   * @param thumbnail - The image on the page.
   */
  private sourceSize(thumbnail: HTMLImageElement | null): ZoomSize & { natural: boolean } {
    const naturalWidth: number = thumbnail?.naturalWidth ?? 0;
    const naturalHeight: number = thumbnail?.naturalHeight ?? 0;

    if (naturalWidth > 0 && naturalHeight > 0) {
      return { width: naturalWidth, height: naturalHeight, natural: true };
    }

    const rect: DOMRect = (thumbnail ?? this.element).getBoundingClientRect();

    return { width: rect.width, height: rect.height, natural: false };
  }

  /**
   * The size the image opens at: its natural size, scaled down to fit the viewport with a margin
   * and never scaled up. An image without a natural size fills the available space with the
   * proportions of its thumbnail.
   * @param source - The size to scale.
   */
  private fit(source: ZoomSize & { natural?: boolean }): ZoomSize {
    const viewport: HTMLElement | undefined = this.window?.document.documentElement;
    const viewportWidth: number = viewport?.clientWidth || this.window?.innerWidth || 0;
    const viewportHeight: number = viewport?.clientHeight || this.window?.innerHeight || 0;
    const margin: number = viewportWidth <= 640 ? 16 : 48;
    const maxWidth: number = Math.max(viewportWidth - margin * 2, 1);
    const maxHeight: number = Math.max(viewportHeight - margin * 2, 1);
    const width: number = source.width || maxWidth;
    const height: number = source.height || maxHeight;
    const scale: number = Math.min(
      source.natural ? 1 : Number.POSITIVE_INFINITY,
      maxWidth / width,
      maxHeight / height,
    );

    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  /**
   * The keyframe that puts the opened image over its thumbnail. The overlay centres the image in
   * the viewport; the frame scales it uniformly to fit the thumbnail's box and centres it there,
   * so an image whose proportions differ from its box's is not distorted.
   * @param thumbnail - The image on the page.
   * @param size - The size of the opened image.
   */
  private thumbnailFrame(thumbnail: HTMLImageElement | null, size: ZoomSize): Keyframe {
    const from: DOMRect = (thumbnail ?? this.element).getBoundingClientRect();
    const viewport: HTMLElement | undefined = this.window?.document.documentElement;
    const left: number = ((viewport?.clientWidth ?? size.width) - size.width) / 2;
    const top: number = ((viewport?.clientHeight ?? size.height) - size.height) / 2;
    const scale: number = Math.min(from.width / size.width, from.height / size.height) || 0;
    const x: number = from.left + (from.width - size.width * scale) / 2 - left;
    const y: number = from.top + (from.height - size.height * scale) / 2 - top;

    return { transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${scale})` };
  }
}
