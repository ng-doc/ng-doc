import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocTooltipDirective } from '@ng-doc/ui-kit';

@Component({
  selector: 'image-viewer',
  imports: [NgDocTooltipDirective],
  template: `<img [src]="src()" [alt]="alt()" [ngDocTooltip]="title()" [delay]="0" />`,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: var(--ng-doc-base-gutter);
      border: 1px solid var(--ng-doc-border-color);
      border-radius: var(--ng-doc-radius-md);
      overflow: hidden;
    }

    img {
      width: 100%;
      max-height: 100px;
      transition: transform 0.2s ease-in-out;
    }

    img:hover {
      transform: scale(1.1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageViewerComponent {
  readonly src = input('');
  readonly alt = input('');
  readonly title = input('');
}
