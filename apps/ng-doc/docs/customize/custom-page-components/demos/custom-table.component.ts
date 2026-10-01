import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'custom-table',
  template: `<ng-content></ng-content>`,
  styles: `
    custom-table table {
      border: 1px solid var(--ng-doc-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class CustomTableComponent {}
