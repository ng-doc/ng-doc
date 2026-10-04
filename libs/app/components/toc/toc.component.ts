import { Clipboard } from '@angular/cdk/clipboard';
import { LocationStrategy } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  Signal,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ɵngDocPageUrl, ɵngDocRouteUrl } from '@ng-doc/app/helpers';
import { NgDocPageToc, NgDocTocItem } from '@ng-doc/app/interfaces';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { WA_LOCATION, WA_WINDOW } from '@ng-web-apis/common';
import { filter } from 'rxjs/operators';

import { NgDocTocElementComponent } from './toc-element/toc-element.component';

/**
 * How far below the navbar, in pixels, a heading counts as the start of the section the reader is
 * in.
 */
const ACTIVE_LINE_OFFSET = 80;

/** Keys that scroll the page; pressing one hands the active section back to scrolling. */
const SCROLL_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

/**
 * The "On this page" rail: the headings of the page, the section the reader is in, the reading
 * progress, and the Back to top, Copy link and Edit this page actions.
 *
 * The active section follows scrolling: it is the last heading above a line a little below the
 * navbar, or the last heading once the page is scrolled to the end. A heading the reader picked
 * (an entry clicked, or a link to its fragment) stays active until the reader scrolls again, so a
 * section near the end of the page, which cannot scroll to the top, is still marked. A soft marker
 * glides to the active entry. Tracking pauses while the rail is hidden.
 *
 * While the rail exists, the L shortcut runs its Copy link action, so the rail confirms the copy.
 */
@Component({
  selector: 'ng-doc-toc',
  templateUrl: './toc.component.html',
  styleUrls: ['./toc.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTocElementComponent],
})
export class NgDocTocComponent implements NgDocPageToc {
  /** The headings of the page. */
  readonly tableOfContent = input<NgDocTocItem[]>([]);

  /** URL where the reader can edit the page source. Without it, the rail has no Edit action. */
  readonly editSourceFileUrl = input<string | undefined>(undefined);

  /** The symbol details of an API page, shown above the headings. */
  readonly details = input<Element | undefined>(undefined);

  /** Index of the heading of the section the reader is in. */
  protected readonly activeIndex = signal(0);

  /** The heading of the section the reader is in. */
  readonly activeItem: Signal<NgDocTocItem | undefined> = computed(
    () => this.tableOfContent()[this.activeIndex()],
  );

  /** How much of the page has been scrolled, in percent. */
  protected readonly progress = signal(0);

  /** Whether the link was just copied. */
  protected readonly copied = signal(false);

  protected readonly document = inject(DOCUMENT);

  private readonly window = inject(WA_WINDOW);
  private readonly location = inject(WA_LOCATION);
  private readonly locationStrategy = inject(LocationStrategy);
  private readonly clipboard = inject(Clipboard);
  private readonly ngZone = inject(NgZone);
  private readonly rail: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly detailsHost = viewChild<ElementRef<HTMLElement>>('details');
  private readonly marker = viewChild<ElementRef<HTMLElement>>('marker');
  private readonly elements = viewChildren(NgDocTocElementComponent);
  private readonly router = inject(Router);
  private copiedTimer?: ReturnType<typeof setTimeout>;
  // Index of the heading the reader picked; it wins over scrolling until the next user scroll.
  private pinned: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // The details are page content that the page hands over; they are moved, not copied, so the
    // content keeps no hidden duplicate. It runs on the server too, so prerendered pages have it.
    effect(() => {
      const host = this.detailsHost()?.nativeElement;
      const details = this.details();

      if (host && details && details.parentNode !== host) {
        // The server DOM has no `replaceChildren()`.
        while (host.firstChild) host.removeChild(host.firstChild);
        host.appendChild(details);
      }
    });

    // A navigation to a fragment of this page (a TOC entry, an anchor in the content, a deep
    // link) picks that heading.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.pinFragment(this.router.parseUrl(this.router.url).fragment));

    // Scroll events are frequent: they are read once per frame, outside the Angular zone, and
    // only the signal writes they cause schedule change detection.
    afterNextRender(() => {
      let frame = 0;
      const onScroll = (): void => {
        frame ||= this.window.requestAnimationFrame(() => {
          frame = 0;
          this.track();
        });
      };

      // Wheel, touch and scrolling keys are the reader scrolling; the scroll events of a jump
      // to an anchor are not, so they keep a picked heading.
      const onUserScroll = (event: Event): void => {
        if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) {
          return;
        }

        if (this.pinned !== null) {
          this.pinned = null;
          onScroll();
        }
      };

      this.ngZone.runOutsideAngular(() => {
        this.window.addEventListener('scroll', onScroll, { passive: true });
        this.window.addEventListener('resize', onScroll, { passive: true });
        this.window.addEventListener('wheel', onUserScroll, { passive: true });
        this.window.addEventListener('touchmove', onUserScroll, { passive: true });
        this.window.addEventListener('keydown', onUserScroll);
      });
      destroyRef.onDestroy(() => {
        this.window.removeEventListener('scroll', onScroll);
        this.window.removeEventListener('resize', onScroll);
        this.window.removeEventListener('wheel', onUserScroll);
        this.window.removeEventListener('touchmove', onUserScroll);
        this.window.removeEventListener('keydown', onUserScroll);
        this.window.cancelAnimationFrame(frame);
      });
    });

    destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));

    // L copies the same link as the Copy link action and shows its confirmation. The shortcuts
    // service runs the last registration of a key, so the built-in L is back once the rail is gone.
    destroyRef.onDestroy(
      inject(NgDocShortcutsService).register({ key: 'l', handler: () => this.copyLink() }),
    );

    // A new table of contents is tracked as soon as it is rendered; a fragment in the URL picks
    // its heading.
    afterRenderEffect({
      read: () => {
        this.tableOfContent();
        untracked(() => {
          this.pinned = null;
          // The route's fragment, not the document's: with hash location the route is the
          // document's fragment.
          this.pinFragment(
            ɵngDocRouteUrl(this.locationStrategy, this.location.href).hash.replace(/^#/, ''),
          );
          this.track();
        });
      },
    });

    // The marker glides to the active entry, and the rail scrolls to keep the entry in view.
    afterRenderEffect({
      earlyRead: () => {
        const element: HTMLElement | undefined =
          this.elements()[this.activeIndex()]?.elementRef.nativeElement;

        return element ? { top: element.offsetTop, height: element.offsetHeight } : null;
      },
      write: (box) => {
        const marker: HTMLElement | undefined = this.marker()?.nativeElement;
        const position = box();

        if (!marker) {
          return;
        }

        marker.style.transform = `translateY(${position?.top ?? 0}px)`;
        marker.style.height = `${position?.height ?? 0}px`;
        this.keepInView(position);
      },
    });
  }

  /**
   * Scrolls the page back to its top.
   */
  scrollToTop(): void {
    const reduceMotion: boolean =
      this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /**
   * Copies the link to the page, without its query and fragment.
   */
  copyLink(): void {
    this.clipboard.copy(ɵngDocPageUrl(this.locationStrategy, this.location));
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    // The label timer must not hold the application unstable, so it runs outside the zone.
    this.copiedTimer = this.ngZone.runOutsideAngular(() =>
      setTimeout(() => this.copied.set(false), 1400),
    );
  }

  /**
   * Marks a heading as the active section until the reader scrolls again.
   * @param index - Index of the heading in the table of contents.
   */
  pin(index: number): void {
    if (index >= 0 && index < this.tableOfContent().length) {
      this.pinned = index;
      this.activeIndex.set(index);
    }
  }

  private pinFragment(fragment: string | null | undefined): void {
    if (!fragment) {
      return;
    }

    const hash: string = safeDecode(fragment);

    this.pin(this.tableOfContent().findIndex((item: NgDocTocItem) => item.hash === hash));
  }

  private track(): void {
    // Below the rail's breakpoint it is not displayed: nothing to update until it shows again.
    if (this.rail.checkVisibility?.() === false) {
      return;
    }

    const root: HTMLElement = this.document.documentElement;
    const max: number = root.scrollHeight - this.window.innerHeight;
    const scrolled: number = this.window.scrollY;

    // A page shorter than the viewport is read in full.
    this.progress.set(
      max > 0 ? Math.min(100, Math.max(0, Math.round((scrolled / max) * 100))) : 100,
    );

    const items: NgDocTocItem[] = this.tableOfContent();

    if (!items.length || this.pinned !== null) {
      return;
    }

    const header: number =
      this.document.querySelector('.ng-doc-header')?.getBoundingClientRect().bottom ?? 0;
    const line: number = header + ACTIVE_LINE_OFFSET;
    let active = 0;

    items.forEach((item: NgDocTocItem, index: number) => {
      if (item.element.getBoundingClientRect().top <= line) {
        active = index;
      }
    });

    if (max > 0 && scrolled >= max - 2) {
      active = items.length - 1;
    }

    this.activeIndex.set(active);
  }

  private keepInView(position: { top: number; height: number } | null): void {
    const list: HTMLElement | undefined = this.list()?.nativeElement;

    if (!list || !position || this.rail.scrollHeight <= this.rail.clientHeight) {
      return;
    }

    const top: number = list.offsetTop + position.top;
    const bottom: number = top + position.height;

    if (top < this.rail.scrollTop) {
      this.rail.scrollTop = top;
    } else if (bottom > this.rail.scrollTop + this.rail.clientHeight) {
      this.rail.scrollTop = bottom - this.rail.clientHeight;
    }
  }
}

/**
 * Decodes a URL fragment, and returns it unchanged when it is not a valid encoding.
 * @param fragment - The fragment, without `#`.
 * @returns The decoded fragment.
 */
function safeDecode(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
