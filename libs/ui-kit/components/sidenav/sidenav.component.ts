import { animate, style, transition, trigger } from '@angular/animations';
import { AsyncPipe, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from '@angular/core';
import { NgDocLetDirective } from '@ng-doc/ui-kit/directives';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

@Component({
  animations: [
    trigger('backdropFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ opacity: 1 })),
      ]),
    ]),
  ],
  selector: 'ng-doc-sidenav',
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [PolymorpheusModule, NgIf, AsyncPipe, NgDocLetDirective],
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
