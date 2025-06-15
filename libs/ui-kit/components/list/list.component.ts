import { ListKeyManager } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, inject, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocListHost } from '@ng-doc/ui-kit/classes/list-host';
import { NgDocListItem } from '@ng-doc/ui-kit/classes/list-item';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { fromEvent, merge, NEVER } from 'rxjs';
import { delayWhen, filter, repeat, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'ng-doc-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocListComponent {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private ngZone = inject(NgZone);
  private listHost = inject<NgDocListHost>(NgDocListHost, { optional: true });

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
            delayWhen(() => this.ngZone.onStable),
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

  registerItem(item: NgDocListItem): void {
    this.items.add(item);

    this.keyManager?.activeItem?.setInactiveStyles();
    this.keyManager = new ListKeyManager(asArray(this.items)).withVerticalOrientation(true);
  }

  unregisterItem(item: NgDocListItem): void {
    this.items.delete(item);
  }
}
