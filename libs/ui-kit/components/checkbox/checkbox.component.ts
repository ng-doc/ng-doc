import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocCheckedChangeDirective } from '@ng-doc/ui-kit/directives/checked-change';
import { NgDocColor } from '@ng-doc/ui-kit/types';
import { DICompareHost, DIStateControl, injectHostControl } from 'di-controls';

/** A checkbox control; project its label. */
@Component({
  selector: 'ng-doc-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrls: ['./checkbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocCheckedChangeDirective, NgDocIconComponent],
  host: {
    '[attr.data-lu-color]': 'color()',
    '[attr.data-disabled]': 'disabled',
  },
})
export class NgDocCheckboxComponent<T> extends DIStateControl<T> {
  /** Colour of the checked box. */
  readonly color = input<NgDocColor>('primary');

  constructor() {
    super({
      host: injectHostControl({ optional: true }),
      compareHost: inject(DICompareHost, { optional: true }),
    });
  }
}
