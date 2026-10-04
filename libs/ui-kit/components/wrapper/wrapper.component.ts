import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Wraps an input and its controls; the border takes the focus color while it holds focus.
 */
@Component({
  selector: 'ng-doc-wrapper',
  template: ` <ng-content></ng-content> `,
  styleUrls: ['./wrapper.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocWrapperComponent {}
