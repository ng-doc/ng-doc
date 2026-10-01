import { ChangeDetectionStrategy, Component } from '@angular/core';

import { BadgeComponent } from '../../../app/badge/badge.component';

@Component({
  selector: 'app-badge-demo',
  imports: [BadgeComponent],
  template: `
    <app-badge label="Draft" />
    <app-badge label="In review" tone="info" />
    <app-badge label="Published" tone="success" />
    <app-badge label="Deprecated" tone="warning" />
  `,
  styles: `
    :host {
      display: flex;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeDemoComponent {}
