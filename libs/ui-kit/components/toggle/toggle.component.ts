import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor } from '@angular/forms';
import { NgDocPositionUtils } from '@ng-doc/ui-kit/utils';
import { DICompareHost, DIStateControl, injectHostControl } from 'di-controls';
import { fromEvent } from 'rxjs';
import { filter, last, map, pairwise, startWith, switchMap, takeUntil, tap } from 'rxjs/operators';

/**
 * Switch control. It works with forms (`ngModel`, reactive forms, `[formField]`) and with host
 * controls; the circle can be clicked or dragged.
 */
@Component({
  selector: 'ng-doc-toggle',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-dragging]': 'dragging()',
    '[attr.data-checked]': 'checked()',
    '[attr.data-disabled]': 'disabled',
  },
})
export class NgDocToggleComponent<T> extends DIStateControl<T> implements ControlValueAccessor {
  private readonly document = inject(DOCUMENT);
  private readonly toggleDestroyRef = inject(DestroyRef);
  private readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');
  private readonly circle = viewChild<ElementRef<HTMLElement>>('circle');

  /** Whether the user is dragging the circle. */
  protected readonly dragging = signal(false);

  private maxPixelValue: number = 0;

  constructor() {
    super({
      host: injectHostControl({ optional: true }),
      compareHost: inject(DICompareHost, { optional: true }),
      onIncomingUpdate: () => this.setState(!!this.checked()),
    });

    // The track is measured once it is rendered (and only in the browser); a value written by a
    // form before that is shown from here.
    afterNextRender(() => {
      const wrapper: HTMLElement | undefined = this.wrapper()?.nativeElement;
      const circle: HTMLElement | undefined = this.circle()?.nativeElement;

      if (!wrapper || !circle) {
        return;
      }

      this.maxPixelValue = Math.max(wrapper.offsetWidth - circle.offsetWidth - 6, 0);
      this.setState(!!this.checked());
      this.listenToDrag(circle);
    });
  }

  override updateModel(value: boolean | T | null): void {
    super.updateModel(value);
    this.setState(!!this.checked());
  }

  protected onWrapperClick(): void {
    if (!this.disabled) {
      this.toggle();
    }
  }

  protected setState(isSelected: boolean): void {
    const circle: HTMLElement | undefined = this.circle()?.nativeElement;

    if (circle) {
      this.renderer.setStyle(
        circle,
        'transform',
        isSelected ? `translateX(${this.maxPixelValue}px)` : 'translateX(0)',
      );
    }
  }

  private listenToDrag(circle: HTMLElement): void {
    fromEvent(circle, 'mousedown')
      .pipe(
        filter(() => !this.disabled),
        switchMap(() => {
          const transition: string = circle.style.transition;
          this.renderer.setStyle(circle, 'transition', '');
          this.dragging.set(true);

          return fromEvent<MouseEvent>(this.document.body, 'mousemove').pipe(
            pairwise(),
            map(
              ([newEvent, oldEvent]: [MouseEvent, MouseEvent]) =>
                oldEvent.clientX - newEvent.clientX,
            ),
            filter((deltaX: number) => deltaX !== 0),
            tap((deltaX: number) => this.changeCirclePosition(deltaX)),
            startWith(null),
            takeUntil(
              fromEvent(this.document.body, 'mouseup').pipe(tap(() => this.dragging.set(false))),
            ),
            last(),
            tap(() => this.renderer.setStyle(circle, 'transition', transition)),
          );
        }),
        takeUntilDestroyed(this.toggleDestroyRef),
      )
      .subscribe((deltaX: number | null) => {
        // Without a drag the press is a click on the circle. While dragging, the track ignores
        // pointer events, so the click that follows does not reach its handler as well.
        if (deltaX === null) {
          this.toggle();
        } else {
          this.detectByCoordinates();
        }
      });
  }

  private detectByCoordinates(): void {
    const wrapper: HTMLElement | undefined = this.wrapper()?.nativeElement;
    const circle: HTMLElement | undefined = this.circle()?.nativeElement;

    if (!this.disabled && wrapper && circle) {
      const wrapperMiddle: number =
        NgDocPositionUtils.getElementPosition(wrapper).x + wrapper.offsetWidth / 2;
      const circleCenterLeft: number =
        NgDocPositionUtils.getElementPosition(circle).x + circle.offsetWidth / 2;

      if (circleCenterLeft > wrapperMiddle) {
        this.check();
      } else {
        this.uncheck();
      }

      this.setState(!!this.checked());
    }
  }

  private changeCirclePosition(delta: number): void {
    const wrapper: HTMLElement | undefined = this.wrapper()?.nativeElement;
    const circle: HTMLElement | undefined = this.circle()?.nativeElement;

    if (wrapper && circle) {
      const wrapperLeft: number = NgDocPositionUtils.getElementPosition(wrapper).x;
      const circleLeft: number = NgDocPositionUtils.getElementPosition(circle).x;
      const newPosition: number = Math.max(
        Math.min(circleLeft - wrapperLeft - 3 + delta, this.maxPixelValue),
        0,
      );

      this.renderer.setStyle(circle, 'transform', `translateX(${newPosition}px)`);
    }
  }
}
