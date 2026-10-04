import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  NgDocHorizontalAlign,
  NgDocOverlayRelativePosition,
  NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';

/** Frames overlay content and draws the arrow that points at the origin. */
@Component({
  selector: 'ng-doc-overlay-pointer',
  templateUrl: './overlay-pointer.component.html',
  styleUrls: ['./overlay-pointer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: {
    '[attr.data-ng-doc-overlay-position]': 'overlayPosition()',
    '[attr.data-ng-doc-overlay-align]': 'overlayAlign()',
  },
})
export class NgDocOverlayPointerComponent {
  /** The side of the origin the overlay is on. */
  readonly overlayPosition = input<NgDocOverlayRelativePosition | null>(null);

  /** How the overlay is aligned along that side. */
  readonly overlayAlign = input<NgDocHorizontalAlign | NgDocVerticalAlign | null>(null);

  /** Draws the arrow. */
  readonly withPointer = input<boolean>(true);
}
