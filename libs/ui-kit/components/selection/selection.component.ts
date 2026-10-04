import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgDocHorizontalAlign, NgDocVerticalAlign } from '@ng-doc/ui-kit/types';

import { NgDocSelectionHostDirective } from './selection-host.directive';

/** The box of the selected element, relative to its offset parent. */
interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Highlight that slides to the selected `ngDocSelectionOrigin` of the closest
 * `ngDocSelectionHost`, for example the underline of the active tab or the thumb of a segmented
 * control. It covers the selected element and moves with a transform.
 *
 * The highlight is measured in the browser only. Until it is placed it is hidden and has no
 * `data-ng-doc-placed` attribute, so the selected element can style itself in the server-rendered
 * page, for example with `ng-doc-selection:not([data-ng-doc-placed]) ~ .selected`. The first
 * placement never animates, and nothing animates when the reader prefers reduced motion.
 */
@Component({
  selector: 'ng-doc-selection',
  template: '',
  styleUrls: ['./selection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-ng-doc-align]': 'align()',
  },
})
export class NgDocSelectionComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly selectionHost = inject(NgDocSelectionHostDirective);
  private readonly destroyRef = inject(DestroyRef);
  // Changes when the selected element or the container resizes, to measure again.
  private readonly resized = signal(0);
  private resizeObserver?: ResizeObserver;
  private observed?: HTMLElement;
  private destroyed: boolean = false;
  // Counts the first placements, so a transition scheduled for an earlier one is dropped.
  private placements: number = 0;

  /**
   * Side of the selected element on which the highlight draws its border, or `null` for no
   * border (a thumb that covers the element, styled by its container).
   */
  readonly align = input<NgDocHorizontalAlign | NgDocVerticalAlign | null>('bottom');

  constructor() {
    // Runs after the render in which the selection changed. Every highlight on the page measures
    // in the read phase and moves in the write phase, so the layout is computed once for all of
    // them. Nothing runs during server rendering, where nothing can be measured.
    afterRenderEffect({
      earlyRead: () => {
        this.resized();

        const element: HTMLElement | undefined = this.selectionHost.selected();

        return {
          element,
          box: element?.offsetWidth
            ? {
                left: element.offsetLeft || 0,
                top: element.offsetTop || 0,
                width: element.offsetWidth,
                height: element.offsetHeight || 0,
              }
            : null,
        };
      },
      write: (measured) => {
        const { element, box } = measured();

        this.observe(element);
        this.place(box);
      },
    });

    // The selected element can change its size without a new selection: when web fonts load,
    // when the container resizes, or when a hidden container (a collapsed pane) is shown.
    afterNextRender(() => {
      const view: (Window & typeof globalThis) | null =
        this.elementRef.nativeElement.ownerDocument.defaultView;

      if (view?.ResizeObserver) {
        this.resizeObserver = new view.ResizeObserver(() =>
          this.resized.update((value: number) => value + 1),
        );

        const container: HTMLElement | null = this.elementRef.nativeElement.parentElement;

        if (container) {
          this.resizeObserver.observe(container);
        }

        this.observe(this.selectionHost.selected());
      }
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.resizeObserver?.disconnect();
    });
  }

  private observe(element?: HTMLElement): void {
    if (this.resizeObserver && element !== this.observed) {
      if (this.observed) {
        this.resizeObserver.unobserve(this.observed);
      }

      if (element) {
        this.resizeObserver.observe(element);
      }

      this.observed = element;
    }
  }

  private place(box: SelectionBox | null): void {
    const host: HTMLElement = this.elementRef.nativeElement;
    const style: CSSStyleDeclaration = host.style;

    // An element without a box (none selected, not rendered yet, or inside a hidden container)
    // cannot be measured. The highlight hides and is placed without animation once the element
    // has a box, instead of sliding in from a stale position.
    if (!box) {
      this.placements++;
      style.visibility = 'hidden';
      host.removeAttribute('data-ng-doc-placed');
      host.removeAttribute('data-ng-doc-animated');

      return;
    }

    // Width and height animate with the transform: scaling instead would distort the rounded
    // corners, the shadow and the border of the highlight. The highlight is absolutely positioned
    // and has no content, so resizing it lays out nothing else.
    style.transform = `translate(${box.left}px, ${box.top}px)`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    style.visibility = 'visible';

    if (!host.hasAttribute('data-ng-doc-placed')) {
      host.setAttribute('data-ng-doc-placed', '');
      this.enableTransition();
    }
  }

  /**
   * Turns the transition on once the first position has been painted. Turning it on in the same
   * frame would animate the highlight from the corner of its container; reading the style to
   * commit the position instead would force a layout for every highlight on the page.
   */
  private enableTransition(): void {
    const host: HTMLElement = this.elementRef.nativeElement;
    const view: (Window & typeof globalThis) | null = host.ownerDocument.defaultView;
    const placement: number = ++this.placements;
    const enable = (): void => {
      if (!this.destroyed && placement === this.placements) {
        host.setAttribute('data-ng-doc-animated', '');
      }
    };

    if (view?.requestAnimationFrame) {
      // The first frame paints the position, the second one may animate from it.
      view.requestAnimationFrame(() => view.requestAnimationFrame(enable));
    } else {
      enable();
    }
  }
}
