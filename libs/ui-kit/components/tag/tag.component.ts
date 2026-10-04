import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocColor, NgDocTagSize } from '@ng-doc/ui-kit/types';

/**
 * A small label. The `default` mod is a solid fill of the colour; the `light` mod is a soft chip
 * whose text mixes the colour toward the heading colour, so it stays readable in every theme.
 */
@Component({
  selector: 'ng-doc-tag',
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-color]': 'color()',
    '[attr.data-ng-doc-size]': 'size()',
    '[attr.data-ng-doc-mod]': 'mod()',
  },
})
export class NgDocTagComponent {
  /** Colour of the tag. */
  readonly color = input<NgDocColor>('primary');

  /** Size of the tag. */
  readonly size = input<NgDocTagSize>('medium');

  /** `default` fills the tag with the colour, `light` makes a soft chip of it. */
  readonly mod = input<'default' | 'light'>('default');
}
