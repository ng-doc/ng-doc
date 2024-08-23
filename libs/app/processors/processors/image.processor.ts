import { Injector, Renderer2 } from '@angular/core';
import { NgDocImageViewerComponent } from '@ng-doc/app/components/image-viewer';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const imageProcessor: NgDocPageProcessor<NgDocImageViewerComponent> = {
  component: NgDocImageViewerComponent,
  selector: 'img:not([zoom="false"])',
  nodeToReplace: (element: Element, injector: Injector) => {
    const renderer: Renderer2 = injector.get(Renderer2);
    const anchor: Element = renderer.createElement('div');

    return element.parentNode?.insertBefore(anchor, element) ?? element;
  },
  extractOptions: (element: Element) => ({
    inputs: {
      src: element.getAttribute('src') ?? '',
      alt: element.getAttribute('alt') ?? '',
    },
    content: [[element]],
  }),
};
