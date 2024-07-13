```angular-ts name="test.ts" {2}
import { coerceNumberProperty } from '@angular/cdk/coercion';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ng-doc-demo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- snippet "Test" -->
    <p>demo works!</p>
    123123
    <!-- snippet -->
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
  // eslint-disable-next-line @typescript-eslint/typedef
  signalInput = input<number, string>(123, { transform: coerceNumberProperty });
  // eslint-disable-next-line @typescript-eslint/typedef
  test = input.required<string>();

  method(): void {
    /* snippet "TypeScript" */
    console.log('demo');
    /* snippet */
  }
}
```
