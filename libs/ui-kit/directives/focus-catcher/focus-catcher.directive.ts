import { DestroyRef, Directive, ElementRef, inject, NgZone, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BLUR_EVENT, FOCUS_EVENT } from '@ng-doc/ui-kit/constants';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { fromEvent, merge, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

/** Tracks whether focus is inside the host element. */
@Directive({
  selector: '[ngDocFocusCatcher]',
  exportAs: 'ngDocFocusCatcher',
  host: {
    '[attr.data-ng-doc-focused]': 'focusedState()',
  },
})
export class NgDocFocusCatcherDirective {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private ngZone = inject(NgZone);

  /** Emits when focus moves into the host. */
  readonly focusEvent = output<Event>();

  /** Emits when focus leaves the host. */
  readonly blurEvent = output<Event>();

  protected readonly focusedState = signal<boolean>(false);

  constructor() {
    const destroyRef: DestroyRef = inject(DestroyRef);

    // Focus events are frequent: they are observed outside the Angular zone, and only a change of
    // the focus state re-enters it. The state is a signal, so a zoneless application renders it
    // too.
    this.ngZone.runOutsideAngular(() =>
      NgDocFocusCatcherDirective.observeFocus(toElement(this.elementRef))
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe((event: FocusEvent) =>
          this.ngZone.run(() => {
            const focused: boolean = event.type === FOCUS_EVENT;

            this.focusedState.set(focused);
            focused ? this.focusEvent.emit(event) : this.blurEvent.emit(event);
          }),
        ),
    );
  }

  /** Whether focus is inside the host. */
  get focused(): boolean {
    return this.focusedState();
  }

  static observeFocus(element: HTMLElement): Observable<FocusEvent> {
    return merge(
      fromEvent<FocusEvent>(element, FOCUS_EVENT),
      fromEvent<FocusEvent>(element, BLUR_EVENT),
    ).pipe(
      debounceTime(0),
      distinctUntilChanged((a: FocusEvent, b: FocusEvent) => a.type === b.type),
    );
  }
}
