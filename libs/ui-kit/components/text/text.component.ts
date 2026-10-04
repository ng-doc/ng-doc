import { ChangeDetectionStrategy, Component, contentChild, input } from '@angular/core';
import { NgDocSize, NgDocTextAlign, NgDocTextColor } from '@ng-doc/ui-kit/types';

import { NgDocTextLeftDirective } from './text-left.directive';
import { NgDocTextRightDirective } from './text-right.directive';

/**
 * Text with the UI Kit typography, optionally with content on its left or right side
 * (`ngDocTextLeft`, `ngDocTextRight`).
 */
@Component({
  selector: '[ng-doc-text]',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngde',
    '[attr.data-ng-doc-text-size]': 'size()',
    '[attr.data-ng-doc-text-color]': 'color()',
    '[attr.data-ng-doc-text-align]': 'align()',
    '[attr.data-ng-doc-text-absolute]': 'absoluteContent()',
  },
})
export class NgDocTextComponent {
  /** Text size */
  readonly size = input<NgDocSize>('medium');

  /** Text color */
  readonly color = input<NgDocTextColor>('normal');

  /** Text align */
  readonly align = input<NgDocTextAlign>('left');

  /** Positions the side content absolutely, so it does not take space from the text. */
  readonly absoluteContent = input<boolean>(false);

  /** Content projected with `ngDocTextLeft`. */
  readonly leftContent = contentChild(NgDocTextLeftDirective);

  /** Content projected with `ngDocTextRight`. */
  readonly rightContent = contentChild(NgDocTextRightDirective);
}
