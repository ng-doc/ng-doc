import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The position of the circle, as CSS `top` and `left` values. */
export interface FloatingCirclePosition {
  top?: string | null;
  left?: string | null;
}

@Component({
  selector: 'ng-doc-floating-circle',
  templateUrl: './floating-circle.component.html',
  styleUrls: ['./floating-circle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingCircleComponent {
  /** The position of the circle in its area. */
  readonly position = input<FloatingCirclePosition>({ top: '10px', left: '10px' });
}
