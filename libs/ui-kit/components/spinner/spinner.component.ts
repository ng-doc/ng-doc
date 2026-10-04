import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocSize } from '@ng-doc/ui-kit/types';

/**
 * Circular loading indicator.
 */
@Component({
  selector: 'ng-doc-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-size]': 'size()',
  },
})
export class NgDocSpinnerComponent {
  /** Spinner size */
  readonly size = input<NgDocSize>('medium');
}
