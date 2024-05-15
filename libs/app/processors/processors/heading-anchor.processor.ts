import { NgDocHeadingAnchorComponent } from '@ng-doc/app/components/heading-anchor';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const headingAnchorProcessor: NgDocPageProcessor<NgDocHeadingAnchorComponent> = {
  component: NgDocHeadingAnchorComponent,
  selector: 'ng-doc-heading-anchor',
  extractOptions: (element: Element) => ({
    inputs: {
      classes: element.getAttribute('class')?.split(' ') || [],
      href: element.getAttribute('href') || '',
      anchor: element.getAttribute('anchor') || '',
    },
  }),
};
