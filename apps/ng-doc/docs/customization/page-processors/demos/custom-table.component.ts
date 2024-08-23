import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'custom-table',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [
    `
      custom-table table {
        border: 1px solid red;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class CustomTableComponent {}
