import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  NgZone,
  Output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BLUR_EVENT, FOCUS_EVENT } from '@ng-doc/ui-kit/constants';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import { fromEvent, merge, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Directive({
  selector: '[ngDocFocusCatcher]',
  exportAs: 'ngDocFocusCatcher',
  standalone: true,
})
export class NgDocFocusCatcherDirective {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private ngZone = inject(NgZone);
  private changeDetectorRef = inject(ChangeDetectorRef);

  @Output()
  focusEvent: EventEmitter<Event> = new EventEmitter<Event>();

  @Output()
  blurEvent: EventEmitter<Event> = new EventEmitter<Event>();

  @HostBinding('attr.data-ng-doc-focused')
  focused: boolean = false;

  constructor() {
    NgDocFocusCatcherDirective.observeFocus(toElement(this.elementRef))
      .pipe(ngDocZoneOptimize(this.ngZone), takeUntilDestroyed())
      .subscribe((event: FocusEvent) => {
        this.focused = event.type === FOCUS_EVENT;
        this.focused ? this.focusEvent.emit(event) : this.blurEvent.emit(event);
        this.changeDetectorRef.markForCheck();
      });
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
