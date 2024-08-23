import { Injector, Renderer2 } from '@angular/core';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

import { CustomTableComponent } from './custom-table.component';

export const tableProcessor: NgDocPageProcessor<CustomTableComponent> = {
  component: CustomTableComponent,
  selector: 'table',
  nodeToReplace: (element: Element, injector: Injector) => {
    // Get the renderer from the injector
    const renderer: Renderer2 = injector.get(Renderer2);
    // Create an anchor element to insert the `CustomTableComponent` in the correct place.
    const anchor: Element = renderer.createElement('div');

    // Insert the anchor before the table and return it
    return element.parentNode?.insertBefore(anchor, element) ?? element;
  },
  extractOptions: (element: Element) => ({
    // Provide the table element as the `ng-content` of the component.
    content: [[element]],
  }),
};
