import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  OnInit,
  Signal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { filter, switchMap, takeUntil, tap } from 'rxjs/operators';

/**
 * Narrows an event to a mouse event.
 * @param event - The event to check.
 */
function isMouseEvent(event: Event): event is MouseEvent {
  return event instanceof MouseEvent;
}

/**
 * Narrows an event to a wheel event.
 * @param event - The event to check.
 */
function isWheelEvent(event: Event): event is WheelEvent {
  return event instanceof WheelEvent;
}

/**
 * Lets the user pan its content by dragging and zoom it with the mouse wheel. Use
 * `ng-doc-magnifier-controller` for buttons that do the same.
 */
@Component({
  selector: 'ng-doc-magnifier',
  imports: [],
  templateUrl: './magnifier.component.html',
  styleUrl: './magnifier.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-drag]': 'drag()',
  },
})
export class NgDocMagnifierComponent implements OnInit {
  protected readonly x = signal<number>(0);
  protected readonly y = signal<number>(0);
  protected readonly scale = signal<number>(1);
  protected readonly transform: Signal<string> = computed(() => {
    const scale = this.scale();
    const x = this.x();
    const y = this.y();
    return `matrix(${scale}, 0, 0, ${scale}, ${x * scale}, ${y * scale})`;
  });
  protected readonly drag = signal<boolean>(false);

  protected readonly document = inject(DOCUMENT);
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    fromEvent(this.element, 'mousedown')
      .pipe(
        switchMap((event: Event) => {
          event.preventDefault();
          this.drag.set(true);

          return fromEvent(this.document, 'mousemove').pipe(
            filter(isMouseEvent),
            takeUntil(fromEvent(this.document, 'mouseup')),
            tap({ complete: () => this.drag.set(false) }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event: MouseEvent) => {
        this.x.update((x) => x + event.movementX / this.scale());
        this.y.update((y) => y + event.movementY / this.scale());
      });

    fromEvent(this.element, 'wheel')
      .pipe(filter(isWheelEvent), takeUntilDestroyed(this.destroyRef))
      .subscribe((event: WheelEvent) => {
        event.preventDefault();

        this.scale.update((scale) => Math.max(scale * (1 + event.deltaY / 1000), 1));
      });
  }

  /**
   * Moves the content horizontally.
   * @param x - Distance in screen pixels.
   */
  incrementX(x: number): void {
    this.x.update((current) => current + x / this.scale());
  }

  /**
   * Moves the content vertically.
   * @param y - Distance in screen pixels.
   */
  incrementY(y: number): void {
    this.y.update((current) => current + y / this.scale());
  }

  /**
   * Zooms in (positive `diff`) or out (negative `diff`); the scale never goes below 1.
   * @param diff - Zoom step, where 1000 doubles the scale.
   */
  zoom(diff: number): void {
    this.scale.update((scale) => Math.max(scale * (1 + diff / 1000), 1));
  }

  /** Resets the position and the scale. */
  reset(): void {
    this.x.set(0);
    this.y.set(0);
    this.scale.set(1);
  }
}
