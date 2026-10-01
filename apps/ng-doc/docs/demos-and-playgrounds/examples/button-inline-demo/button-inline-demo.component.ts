import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocButtonComponent, NgDocColor } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-button-inline-demo',
  imports: [NgDocButtonComponent],
  template: `<button ng-doc-button [color]="color()">Button</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonInlineDemoComponent {
  readonly color = input<NgDocColor>('primary');
}
