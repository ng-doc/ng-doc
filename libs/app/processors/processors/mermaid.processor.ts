import { NgDocMermaidViewerComponent } from '@ng-doc/app/components/mermaid-viewer';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const mermaidProcessor: NgDocPageProcessor<NgDocMermaidViewerComponent> = {
  component: NgDocMermaidViewerComponent,
  selector: 'pre.mermaid',
  extractOptions: (element: Element) => ({
    inputs: {
      graph: element.textContent ?? '',
    },
  }),
};
