import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocColor, NgDocSize } from '@ng-doc/ui-kit/types';

/**
 * A small coloured dot, for example to mark a state next to a label.
 */
@Component({
  selector: 'ng-doc-dot',
  template: ``,
  styleUrls: ['./dot.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-color]': 'color()',
    '[attr.data-ng-doc-size]': 'size()',
  },
})
export class NgDocDotComponent {
  /** Colour of the dot. */
  readonly color = input<NgDocColor>();

  /** Size of the dot: 4px (`small`), 8px (`medium`) or 16px (`large`). */
  readonly size = input<NgDocSize>();
}
