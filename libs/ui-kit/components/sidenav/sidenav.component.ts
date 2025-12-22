import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

@Component({
  selector: 'ng-doc-sidenav',
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusModule],
  host: {
    '[attr.data-ng-doc-sidebar]': '!!sidebar',
  },
})
export class NgDocSidenavComponent {
  /**
   * Content of the sidenav.
   */
  @Input()
  sidebar: NgDocContent = '';

  /**
   * Indicates whether the sidenav is opened or not.
   * This is used to trigger the animation.
   */
  @Input()
  @HostBinding('attr.data-ng-doc-opened')
  opened: boolean = true;

  /**
   * Indicates whether the sidenav has a backdrop or not.
   */
  @Input()
  hasBackdrop: boolean = true;

  @Output()
  closeEvent: EventEmitter<void> = new EventEmitter<void>();
}
