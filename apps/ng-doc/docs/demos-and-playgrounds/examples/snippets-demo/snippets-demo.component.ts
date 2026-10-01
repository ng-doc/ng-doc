import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { NgDocButtonComponent, NgDocColor } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-snippets-demo',
  imports: [NgDocButtonComponent],
  template: `
    <!-- snippet "Template" icon="angular" -->
    <button ng-doc-button [color]="color()" (click)="increment()">
      Clicked {{ count() }} times
    </button>
    <!-- snippet -->
  `,
  styles: `
    /* snippet:css "Styles" */
    :host {
      display: flex;
      justify-content: center;
    }
    /* snippet */
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnippetsDemoComponent {
  // snippet "Component" opened
  readonly color = input<NgDocColor>('primary');
  protected readonly count = signal(0);

  protected increment(): void {
    this.count.update((count: number) => count + 1);
  }
  // snippet
}
