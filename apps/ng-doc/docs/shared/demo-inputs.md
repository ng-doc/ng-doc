## Inputs

You can also add input fields to your demo component and then pass their values during rendering of
the demo. This will give you greater reusability.

```typescript name="button-demo.component.ts"
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocButtonComponent, NgDocColor } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-button-inline-demo',
  standalone: true,
  imports: [NgDocButtonComponent],
  template: ` <button ng-doc-button [color]="color">Button</button> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonInlineDemoComponent {
  @Input()
  color: NgDocColor = 'primary';
}
```
