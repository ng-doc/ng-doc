import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostBinding, inject, Input } from '@angular/core';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocCheckedChangeDirective } from '@ng-doc/ui-kit/directives/checked-change';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { NgDocColor } from '@ng-doc/ui-kit/types';
import { DICompareHost, DIStateControl, injectHostControl } from 'di-controls';

@Component({
  selector: 'ng-doc-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrls: ['./checkbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocCheckedChangeDirective, NgDocFocusableDirective, NgIf, NgDocIconComponent],
})
export class NgDocCheckboxComponent<T> extends DIStateControl<T> {
  @Input()
  @HostBinding('attr.data-lu-color')
  color: NgDocColor = 'primary';

  constructor() {
    super({
      host: injectHostControl({ optional: true }),
      compareHost: inject(DICompareHost, { optional: true }),
    });
  }
}
