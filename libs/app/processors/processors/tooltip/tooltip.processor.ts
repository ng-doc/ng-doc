import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { NgDocTooltipDirective } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-tooltip-wrapper',
  template: `
    <div
      class="content-projection"
      [ngDocTooltip]="content() ?? ''"
      [displayOrigin]="tooltipElement() ?? contentProjection"
      [pointerOrigin]="tooltipElement() ?? contentProjection"
      #contentProjection>
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      .content-projection {
        display: unset;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTooltipDirective],
})
class NgDocTooltipWrapperComponent {
  readonly content = input<string>();

  protected readonly tooltipElement = signal<HTMLElement | null>(null);

  private readonly contentProjection = viewChild.required<string, ElementRef<HTMLElement>>(
    'contentProjection',
    { read: ElementRef },
  );

  constructor() {
    // The tooltip points at the projected element, which is only in the DOM after the first
    // render. On the server nothing opens a tooltip, so the wrapper is origin enough there.
    afterNextRender(() => {
      const element = this.contentProjection().nativeElement.querySelector('[ngDocTooltip]');

      this.tooltipElement.set(element instanceof HTMLElement ? element : null);
    });
  }
}

/**
 * Wraps an element with an `ngDocTooltip` attribute in a component that shows the attribute's
 * value as a tooltip.
 */
export const tooltipProcessor: NgDocPageProcessor<NgDocTooltipWrapperComponent> = {
  component: NgDocTooltipWrapperComponent,
  selector: '[ngDocTooltip]',
  extractOptions: (element: Element) => ({
    inputs: {
      content: element.getAttribute('ngDocTooltip') ?? '',
    },
    content: [[element.cloneNode(true)]],
  }),
};
