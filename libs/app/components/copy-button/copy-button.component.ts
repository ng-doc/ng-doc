import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, Input, ViewChild } from '@angular/core';
import {
  NgDocButtonIconComponent,
  NgDocSmoothResizeComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-copy-button',
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective, NgDocSmoothResizeComponent],
  template: `
    <button
      ng-doc-button-icon
      [rounded]="false"
      (click)="copy(); tooltipText = 'Copied!'"
      [ngDocTooltip]="tooltipContent"
      (mouseenter)="tooltipText = 'Copy to clipboard'">
      <ng-template #tooltipContent>
        <ng-doc-smooth-resize [trigger]="tooltipText">
          {{ tooltipText }}
        </ng-doc-smooth-resize>
      </ng-template>
      <ng-content></ng-content>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocCopyButtonComponent {
  @Input({ required: true })
  text!: string;

  @ViewChild(NgDocTooltipDirective, { static: true })
  tooltip!: NgDocTooltipDirective;

  protected tooltipText: string = '';
  protected readonly clipboard = inject(Clipboard);

  copy(): void {
    this.clipboard.copy(this.text);
    this.tooltip.show();
  }
}
