import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocBlockquoteType } from '@ng-doc/ui-kit/types';

@Component({
  selector: 'blockquote[ng-doc-blockquote]',
  templateUrl: './blockquote.component.html',
  styleUrls: ['./blockquote.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocIconComponent],
})
export class NgDocBlockquoteComponent {
  @Input()
  @HostBinding('attr.data-ng-doc-type')
  type: NgDocBlockquoteType = 'default';

  @Input()
  icon?: string;
}
