import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  HostBinding,
  inject,
  Input,
  NgZone,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
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

@Directive({
  selector: '[ngDocPaneFront]',
  standalone: true,
})
export class NgDocPaneFrontDirective {}

@Directive({
  selector: '[ngDocPaneBack]',
  standalone: true,
})
export class NgDocPaneBackDirective {}

@Component({
  selector: 'ng-doc-pane',
  templateUrl: './pane.component.html',
  styleUrls: ['./pane.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocPaneComponent implements OnChanges {
  private readonly document = inject<Document>(DOCUMENT);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ngZone = inject(NgZone);

  @Input()
  expanded: boolean = false;

  @ViewChild('resizer', { static: true })
  resizer?: ElementRef<HTMLElement>;

  width: string = '0%';

  @HostBinding('attr.data-ng-doc-dragging')
  dragging: boolean = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (this.resizer) {
        const mouseDown$ = fromEvent(this.resizer.nativeElement, 'mousedown').pipe(
          tap(() => {
            this.dragging = true;
            this.changeDetectorRef.markForCheck();
          }),
        );

        const mouseUp$ = fromEvent(this.document, 'mouseup').pipe(
          tap(() => {
            this.dragging = false;
            this.changeDetectorRef.markForCheck();
          }),
        );

        const mouseMove$ = (fromEvent(this.document, 'mousemove') as Observable<MouseEvent>).pipe(
          map((event: MouseEvent) => event.clientX),
          pairwise(),
          map(([prev, next]: [number, number]) => next - prev),
        );

        mouseDown$
          .pipe(
            switchMap(() => {
              const dragEvent$ = mouseMove$.pipe(takeUntil(mouseUp$));

              const clickEvent$ = mouseUp$.pipe(
                map(() => null),
                takeUntil(mouseMove$),
                take(1),
              );

              return merge(dragEvent$, clickEvent$);
            }),
            filter((delta: number | null) => delta !== 0),
            ngDocZoneOptimize(this.ngZone),
            takeUntilDestroyed(destroyRef),
          )
          .subscribe((delta: number | null) => {
            delta === null ? this.toggle() : this.addDelta(delta);
          });
      }

      fromEvent(window, 'resize')
        .pipe(debounceTime(100), ngDocZoneOptimize(this.ngZone), takeUntilDestroyed(destroyRef))
        .subscribe(() => this.addDelta(0));
    });

    this.addDelta(0);
  }

  ngOnChanges({ expanded }: SimpleChanges): void {
    if (expanded) {
      expanded.currentValue
        ? this.addDelta(this.elementRef.nativeElement.offsetWidth)
        : this.addDelta(-this.elementRef.nativeElement.offsetWidth);
    }
  }

  toggle(): void {
    if (this.resizer) {
      const middle = this.elementRef.nativeElement.offsetWidth / 2;

      if (this.resizer.nativeElement.offsetLeft < middle) {
        this.addDelta(this.elementRef.nativeElement.offsetWidth);
      } else {
        this.addDelta(-this.elementRef.nativeElement.offsetWidth);
      }
    }
  }

  private addDelta(delta: number): void {
    if (this.resizer) {
      const maxWidth =
        this.elementRef.nativeElement.offsetWidth - this.resizer.nativeElement.offsetWidth;

      this.width = `${Math.min(
        maxWidth,
        Math.max(0, this.resizer.nativeElement.offsetLeft + delta),
      )}px`;

      this.changeDetectorRef.detectChanges();
    }
  }
}
