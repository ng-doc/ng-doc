import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  NgZone,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge, Observable } from 'rxjs';
import {
  debounceTime,
  filter,
  map,
  pairwise,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

/** Marks the content in front of an `ng-doc-pane` (the right side). */
@Directive({
  selector: '[ngDocPaneFront]',
})
export class NgDocPaneFrontDirective {}

/** Marks the content behind an `ng-doc-pane` (the left side, revealed by dragging). */
@Directive({
  selector: '[ngDocPaneBack]',
})
export class NgDocPaneBackDirective {}

/** The share of the pane a keyboard step moves the resizer by. */
const KEYBOARD_STEP = 0.1;

/**
 * Two panes side by side with a resizer between them. Drag the resizer, click it or use the
 * arrow keys on it to reveal the back pane; Enter or Space toggles it.
 */
@Component({
  selector: 'ng-doc-pane',
  templateUrl: './pane.component.html',
  styleUrls: ['./pane.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-dragging]': 'dragging()',
  },
})
export class NgDocPaneComponent {
  private readonly document = inject<Document>(DOCUMENT);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ngZone = inject(NgZone);

  /** Whether the back pane is revealed. */
  readonly expanded = input<boolean>(false);

  /** The resizer between the panes. */
  readonly resizer = viewChild.required<ElementRef<HTMLElement>>('resizer');

  /** Width of the back pane, as a CSS length. */
  readonly width = signal<string>('0px');

  /** Share of the pane the back pane takes, in percent, for assistive technology. */
  protected readonly valueNow = signal<number>(0);

  /** Whether the resizer is being dragged. */
  protected readonly dragging = signal<boolean>(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Opens or closes the back pane when `expanded` changes; it measures, so it runs after render.
    afterRenderEffect({
      write: () => {
        const expanded: boolean = this.expanded();

        untracked(() => {
          const width: number = this.elementRef.nativeElement.offsetWidth;

          this.addDelta(expanded ? width : -width);
        });
      },
    });

    // Pointer and resize events arrive often; they are handled outside the Angular zone, and the
    // signals they write schedule the render.
    afterNextRender(() =>
      this.ngZone.runOutsideAngular(() => {
        const resizer: HTMLElement = this.resizer().nativeElement;
        const mouseDown$ = fromEvent(resizer, 'mousedown').pipe(tap(() => this.dragging.set(true)));
        const mouseUp$ = fromEvent(this.document, 'mouseup').pipe(
          tap(() => this.dragging.set(false)),
        );
        const mouseMove$ = (fromEvent(this.document, 'mousemove') as Observable<MouseEvent>).pipe(
          map((event: MouseEvent) => event.clientX),
          pairwise(),
          map(([prev, next]: [number, number]) => next - prev),
        );

        mouseDown$
          .pipe(
            switchMap(() =>
              merge(
                mouseMove$.pipe(takeUntil(mouseUp$)),
                mouseUp$.pipe(
                  map(() => null),
                  takeUntil(mouseMove$),
                  take(1),
                ),
              ),
            ),
            filter((delta: number | null) => delta !== 0),
            takeUntilDestroyed(destroyRef),
          )
          .subscribe((delta: number | null) =>
            delta === null ? this.toggle() : this.addDelta(delta),
          );

        fromEvent(this.document.defaultView ?? window, 'resize')
          .pipe(debounceTime(100), takeUntilDestroyed(destroyRef))
          .subscribe(() => this.addDelta(0));
      }),
    );
  }

  /** Reveals the back pane when it is mostly hidden, and hides it otherwise. */
  toggle(): void {
    untracked(() => {
      const width: number = this.elementRef.nativeElement.offsetWidth;

      this.addDelta(this.resizer().nativeElement.offsetLeft < width / 2 ? width : -width);
    });
  }

  /**
   * Moves the resizer with the keyboard.
   * @param event - The key press on the resizer.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const step: number = this.elementRef.nativeElement.offsetWidth * KEYBOARD_STEP;
    const width: number = this.elementRef.nativeElement.offsetWidth;
    const delta: number | undefined = {
      ArrowRight: step,
      ArrowLeft: -step,
      Home: -width,
      End: width,
    }[event.key];

    if (delta !== undefined) {
      event.preventDefault();
      this.addDelta(delta);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle();
    }
  }

  private addDelta(delta: number): void {
    const host: HTMLElement = this.elementRef.nativeElement;
    const resizer: HTMLElement | undefined = this.resizer()?.nativeElement;

    if (resizer) {
      const maxWidth: number = host.offsetWidth - resizer.offsetWidth;
      const width: number = Math.min(maxWidth, Math.max(0, resizer.offsetLeft + delta));

      this.width.set(`${width}px`);
      this.valueNow.set(maxWidth > 0 ? Math.round((width / maxWidth) * 100) : 0);
    }
  }
}
