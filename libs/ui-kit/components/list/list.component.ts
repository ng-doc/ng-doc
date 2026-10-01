import { ListKeyManager } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocListHost } from '@ng-doc/ui-kit/classes/list-host';
import { NgDocListItem } from '@ng-doc/ui-kit/classes/list-item';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { fromEvent, merge, NEVER, timer } from 'rxjs';
import { delayWhen, filter, repeat, takeUntil } from 'rxjs/operators';

/**
 * Keyboard navigation for the options inside it: arrow keys move the active option and Enter
 * selects it. The keys also work from the list host's origin (for example a combobox input).
 */
@Component({
  selector: 'ng-doc-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocListComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly listHost = inject<NgDocListHost>(NgDocListHost, { optional: true });

  private keyManager: ListKeyManager<NgDocListItem> | null = null;
  private readonly items: Set<NgDocListItem> = new Set<NgDocListItem>();

  constructor() {
    const origin: HTMLElement | null = this.listHost?.listHostOrigin
      ? toElement(this.listHost?.listHostOrigin)
      : null;
    const list: HTMLElement = toElement(this.elementRef);

    merge(
      fromEvent(list, 'keydown'),
      origin
        ? fromEvent(origin, 'keydown').pipe(
            takeUntil(fromEvent(list, 'keydown')),
            // Handle the key in the next macrotask, once the origin's own handlers and the change
            // detection they schedule have run. `NgZone.onStable` never emits in a zoneless
            // application, and waiting for the application to be stable would stall the keys
            // while any timer or request is pending. The timer is cancelled on destroy.
            delayWhen(() => timer(0)),
            repeat(),
          )
        : NEVER,
    )
      .pipe(
        filter((event: Event) => !event.defaultPrevented),
        takeUntilDestroyed(),
      )
      .subscribe((event: Event) => {
        const typedEvent: KeyboardEvent = event as KeyboardEvent;

        switch (typedEvent.key) {
          case 'Enter':
            this.keyManager?.activeItem?.selectByUser();

            typedEvent.preventDefault();
            break;
        }

        this.keyManager?.activeItem?.setInactiveStyles();
        this.keyManager?.onKeydown(typedEvent);
        this.keyManager?.activeItem?.setActiveStyles();

        if (this.keyManager?.activeItem)
          toElement(this.keyManager?.activeItem.elementRef).scrollIntoView({ block: 'nearest' });
      });
  }

  /**
   * Adds an item to the keyboard navigation.
   * @param item - The item to add.
   */
  registerItem(item: NgDocListItem): void {
    this.items.add(item);

    this.keyManager?.activeItem?.setInactiveStyles();
    this.keyManager = new ListKeyManager(asArray(this.items)).withVerticalOrientation(true);
  }

  /**
   * Removes an item from the keyboard navigation.
   * @param item - The item to remove.
   */
  unregisterItem(item: NgDocListItem): void {
    this.items.delete(item);
  }
}
