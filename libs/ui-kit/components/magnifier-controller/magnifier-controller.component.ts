import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocButtonIconComponent } from '@ng-doc/ui-kit/components/button-icon';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocMagnifierComponent } from '@ng-doc/ui-kit/components/magnifier';

/**
 * Buttons that pan, zoom and reset an `ng-doc-magnifier`.
 */
@Component({
  selector: 'ng-doc-magnifier-controller',
  imports: [NgDocButtonIconComponent, NgDocIconComponent],
  templateUrl: './magnifier-controller.component.html',
  styleUrl: './magnifier-controller.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MagnifierControllerComponent {
  /** The magnifier to control. */
  readonly magnifier = input.required<NgDocMagnifierComponent>();
}
