import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
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
  host: {
    '[attr.data-ng-doc-size]': 'size()',
    '[attr.data-ng-doc-color]': 'color()',
    '[attr.data-ng-doc-rounded]': 'rounded()',
  },
})
export class NgDocButtonComponent {
  /**
   * Size of the button. Can be 'small', 'medium', or 'large'.
   * Default is 'small'.
   */
  readonly size = input<NgDocSize>('small');

  /**
   * Color of the button. Can be 'primary', 'secondary', etc.
   * Default is 'primary'.
   */
  readonly color = input<NgDocColor>('primary');

  /**
   * Whether the button is rounded or not.
   * Default is false.
   */
  readonly rounded = input<boolean, unknown>(false, { transform: booleanAttribute });
}
