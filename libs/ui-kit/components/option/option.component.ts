import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { NgDocListItem } from '@ng-doc/ui-kit/classes/list-item';
import { NgDocListComponent } from '@ng-doc/ui-kit/components/list';
import { DICompareHost, DIStateControl, injectHostControl } from 'di-controls';

/**
 * Option of a list. Clicking it, or pressing Enter while it is active, checks it in its host
 * control; an option that contains a link follows the link instead.
 */
@Component({
  selector: 'ng-doc-option',
  template: '<ng-content></ng-content>',
  styleUrls: ['./option.component.scss'],
  providers: [
    {
      provide: NgDocListItem,
      useExisting: NgDocOptionComponent,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-hover]': 'hovered()',
    '(click)': 'check()',
  },
})
export class NgDocOptionComponent<T> extends DIStateControl<T> implements NgDocListItem, OnDestroy {
  override readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  /** Whether the option is the active item of the list's keyboard navigation. */
  protected readonly hovered = signal(false);
  protected readonly list: NgDocListComponent | null = inject(NgDocListComponent, {
    optional: true,
  });

  constructor() {
    super({
      host: injectHostControl({ optional: true }),
      compareHost: inject(DICompareHost, { optional: true }),
    });

    this.list?.registerItem(this);
  }

  /** Selects the option as if the user did: follows its link, or checks it. */
  selectByUser(): void {
    const anchor: HTMLAnchorElement | null = this.elementRef.nativeElement.querySelector('a');

    if (anchor) {
      anchor.click();
    } else {
      this.check();
    }
  }

  /** Marks the option as the active item. */
  setActiveStyles(): void {
    this.hovered.set(true);
  }

  /** Clears the active-item mark. */
  setInactiveStyles(): void {
    this.hovered.set(false);
  }

  ngOnDestroy(): void {
    this.list?.unregisterItem(this);
  }
}
