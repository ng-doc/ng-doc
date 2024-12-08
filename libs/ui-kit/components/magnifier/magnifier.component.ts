import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  NgZone,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { filter, switchMap, takeUntil, tap } from 'rxjs/operators';

/**
 *
 * @param event
 */
function isMouseEvent(event: Event): event is MouseEvent {
  return event instanceof MouseEvent;
}

/**
 *
 * @param event
 */
function isWheelEvent(event: Event): event is WheelEvent {
  return event instanceof WheelEvent;
}

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
  protected readonly transform;
  protected readonly drag = signal<boolean>(false);

  protected readonly document = inject(DOCUMENT);
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly ngZone = inject(NgZone);
  protected readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.transform = computed(() => {
      const scale = this.scale();
      const x = this.x();
      const y = this.y();
      return `matrix(${scale}, 0, 0, ${scale}, ${x * scale}, ${y * scale})`;
    });
  }

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

  incrementX(x: number): void {
    this.x.update((current) => current + x / this.scale());
  }

  incrementY(y: number): void {
    this.y.update((current) => current + y / this.scale());
  }

  zoom(diff: number): void {
    this.scale.update((scale) => Math.max(scale * (1 + diff / 1000), 1));
  }

  reset(): void {
    this.x.set(0);
    this.y.set(0);
    this.scale.set(1);
  }
}
