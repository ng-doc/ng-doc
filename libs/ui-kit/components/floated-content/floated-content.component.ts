import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  inject,
  Input,
} from '@angular/core';
import { BaseElement, NgDocHorizontalAlign } from '@ng-doc/ui-kit/types';

@Component({
  selector: '[ng-doc-floated-content]',
  template: ` <ng-content></ng-content> `,
  styleUrls: ['./floated-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocFloatedContentComponent {
  @Input()
  bindTo?: BaseElement<HTMLElement>;

  @Input()
  propertyName: string = '';

  @Input()
  @HostBinding('attr.data-ng-doc-align')
  alignTo: NgDocHorizontalAlign = 'left';

  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
}
