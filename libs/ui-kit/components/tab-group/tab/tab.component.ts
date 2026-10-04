import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';

/** One tab of an `ng-doc-tab-group`: its label, its id and the content of its panel. */
@Component({
  selector: 'ng-doc-tab, a[ng-doc-tab]',
  template: '',
  styleUrls: ['./tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabComponent<T> {
  /** Label of the tab: a string or a template. */
  readonly label = input<NgDocContent>('');

  /** Id the group's `openedTab` refers to. */
  readonly id = input<T | number>(0);

  /** Content of the tab's panel. */
  readonly content = input<NgDocContent>('');
}
