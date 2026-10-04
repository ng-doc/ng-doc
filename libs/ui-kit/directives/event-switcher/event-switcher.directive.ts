import { DestroyRef, Directive, ElementRef, inject, input, NgZone, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { Constructor } from '@ng-doc/core/types';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { BaseElement } from '@ng-doc/ui-kit/types';
import { fromEvent, merge } from 'rxjs';

/**
 * Re-dispatches the given events of the host on another element, for example the events of an
 * overlay on its origin.
 */
@Directive({
  selector: '[ngDocEventSwitcher]',
})
export class NgDocEventSwitcherDirective implements OnInit {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** The element that receives the events. */
  readonly switchTo = input<BaseElement<HTMLElement> | null>(null, {
    alias: 'ngDocEventSwitcher',
  });

  /** The names of the events to re-dispatch. They are read once, when the directive starts. */
  readonly events = input<string | string[]>([]);

  ngOnInit(): void {
    // The copies are dispatched outside the Angular zone: the listeners of the target decide
    // whether they need change detection, as they would for a native event.
    this.ngZone.runOutsideAngular(() =>
      merge(
        ...asArray(this.events()).map((eventName: string) =>
          fromEvent(this.elementRef.nativeElement, eventName),
        ),
      )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event: Event) => {
          const switchTo: BaseElement<HTMLElement> | null = this.switchTo();

          if (switchTo && !event.defaultPrevented && event.bubbles) {
            event.stopPropagation();
            this.makeEvent(event, toElement(switchTo));
          }
        }),
    );
  }

  private makeEvent(from: Event, target: Element): void {
    const eventConstructor: Constructor<Event> = from.constructor as Constructor<Event>;
    target.dispatchEvent(new eventConstructor(from.type, from));
  }
}
