import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/**
 * Layout with a side panel next to the projected content.
 *
 * At 900px and below the side panel becomes an overlay that slides in from the left; `opened`
 * shows it and `closeEvent` asks the owner to hide it. The panel has the id `ng-doc-sidenav`, so a
 * toggle button can point `aria-controls` at it.
 */
@Component({
  selector: 'ng-doc-sidenav',
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusOutlet],
  host: {
    '[attr.data-ng-doc-sidebar]': '!!sidebar()',
    '[attr.data-ng-doc-opened]': 'opened()',
  },
})
export class NgDocSidenavComponent {
  /**
   * Content of the sidenav.
   */
  readonly sidebar = input<NgDocContent>('');

  /**
   * Indicates whether the sidenav is opened or not.
   * This is used to trigger the animation.
   */
  readonly opened = input<boolean, unknown>(true, { transform: booleanAttribute });

  /**
   * Indicates whether the sidenav has a backdrop or not.
   */
  readonly hasBackdrop = input<boolean, unknown>(true, { transform: booleanAttribute });

  /**
   * Emits when the backdrop is clicked, so the owner can close the sidenav.
   */
  readonly closeEvent = output<void>();
}
