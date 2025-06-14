import { DestroyRef, Directive, ElementRef, inject, Input, NgZone, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { Constructor } from '@ng-doc/core/types';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { ngDocZoneDetach } from '@ng-doc/ui-kit/observables';
import { BaseElement } from '@ng-doc/ui-kit/types';
import { fromEvent, merge } from 'rxjs';

@Directive({
  selector: '[ngDocEventSwitcher]',
  standalone: true,
})
export class NgDocEventSwitcherDirective implements OnInit {
  @Input('ngDocEventSwitcher')
  switchTo: BaseElement<HTMLElement> | null = null;

  @Input()
  events: string | string[] = [];

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    merge(
      ...asArray(this.events).map((eventName: string) =>
        fromEvent(this.elementRef.nativeElement, eventName),
      ),
    )
      .pipe(ngDocZoneDetach(this.ngZone), takeUntilDestroyed(this.destroyRef))
      .subscribe((event: Event) => {
        if (this.switchTo && !event.defaultPrevented && event.bubbles) {
          event.stopPropagation();
          this.makeEvent(event, toElement(this.switchTo));
        }
      });
  }

  private makeEvent(from: Event, target: Element): void {
    const eventConstructor: Constructor<Event> = from.constructor as Constructor<Event>;
    target.dispatchEvent(new eventConstructor(from.type, from));
  }
}
