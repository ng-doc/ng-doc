import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { NgDocSize } from '@ng-doc/ui-kit/types';

@Component({
  selector:
    'button[ng-doc-button-icon], a[ng-doc-button-icon], button[ng-doc-button-icon-raised], a[ng-doc-button-icon-raised], button[ng-doc-button-icon-transparent], a[ng-doc-button-icon-transparent]',
  templateUrl: './button-icon.component.html',
  styleUrls: ['./button-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocButtonIconComponent {
  @Input()
  @HostBinding('attr.data-ng-doc-size')
  size: NgDocSize = 'medium';

  @Input()
  @HostBinding('attr.data-ng-doc-rounded')
  rounded: boolean = true;
}
