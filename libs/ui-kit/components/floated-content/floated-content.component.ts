import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { BaseElement, NgDocHorizontalAlign } from '@ng-doc/ui-kit/types';

/** Content that floats over the edge of its container, aligned to one side. */
@Component({
  selector: '[ng-doc-floated-content]',
  template: ` <ng-content></ng-content> `,
  styleUrls: ['./floated-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-align]': 'alignTo()',
  },
})
export class NgDocFloatedContentComponent {
  readonly bindTo = input<BaseElement<HTMLElement>>();

  readonly propertyName = input<string>('');

  /** The side the content is aligned to. */
  readonly alignTo = input<NgDocHorizontalAlign>('left');

  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
}
