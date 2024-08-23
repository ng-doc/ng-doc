import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { NgDocColor, NgDocSize } from '@ng-doc/ui-kit/types';

/**
 * `NgDocButtonComponent` is a reusable button component with customizable properties.
 * It can be used as a regular button, a flat button, or a text button.
 * @example
 * ```html
 * <button ng-doc-button [size]="'large'" [color]="'secondary'" [rounded]="true">Click me</button>
 * ```
 */
@Component({
  selector:
    'button[ng-doc-button], a[ng-doc-button], button[ng-doc-button-flat], a[ng-doc-button-flat], button[ng-doc-button-text], a[ng-doc-button-text]',
  template: `<ng-content></ng-content>`,
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocButtonComponent {
  /**
   * Size of the button. Can be 'small', 'medium', or 'large'.
   * Default is 'small'.
   */
  @Input()
  @HostBinding('attr.data-ng-doc-size')
  size: NgDocSize = 'small';

  /**
   * Color of the button. Can be 'primary', 'secondary', etc.
   * Default is 'primary'.
   */
  @Input()
  @HostBinding('attr.data-ng-doc-color')
  color: NgDocColor = 'primary';

  /**
   * Whether the button is rounded or not.
   * Default is false.
   */
  @Input()
  @HostBinding('attr.data-ng-doc-rounded')
  rounded: boolean = false;
}
