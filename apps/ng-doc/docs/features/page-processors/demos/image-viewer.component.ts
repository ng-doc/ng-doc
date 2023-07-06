import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocTooltipDirective} from '@ng-doc/ui-kit';

@Component({
  selector: 'image-viewer',
  standalone: true,
  imports: [NgDocTooltipDirective],
  template: `<img [src]="src" [alt]="alt" [ngDocTooltip]="title" [delay]="0" />`,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        padding: var(--ng-doc-base-gutter);
        border: 1px solid var(--ng-doc-base-2);
        border-radius: var(--ng-doc-base-gutter);
        overflow: hidden;
      }

      img {
        max-height: 100px;
        transition: transform 0.2s ease-in-out;
      }

      img:hover {
        transform: scale(1.1);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewerComponent {
  @Input()
  src: string = '';

  @Input()
  alt: string = '';

  @Input()
  title?: string;
}
