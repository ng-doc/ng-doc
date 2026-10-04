import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocContent, NgDocHorizontalAlign } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/** A `label` with a caption above its content. */
@Component({
  selector: 'label[ng-doc-label]',
  templateUrl: './label.component.html',
  styleUrls: ['./label.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusOutlet],
  host: {
    '[attr.data-ng-doc-align]': 'align()',
  },
})
export class NgDocLabelComponent {
  /** The caption: a string or a template. */
  readonly label = input<NgDocContent>('', { alias: 'ng-doc-label' });

  /** Alignment of the caption. */
  readonly align = input<NgDocHorizontalAlign>('left');
}
