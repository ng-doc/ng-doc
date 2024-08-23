import { NgDocPageLinkComponent } from '@ng-doc/app/components/page-link';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const linkProcessor: NgDocPageProcessor<NgDocPageLinkComponent> = {
  component: NgDocPageLinkComponent,
  selector: 'a',
  extractOptions: (element: Element) => ({
    inputs: {
      href: element.getAttribute('href') ?? '',
      classes: element.getAttribute('class') ?? '',
    },
    content: [Array.from(element.childNodes)],
  }),
};
