import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

import { ImageViewerComponent } from './image-viewer.component';

export const imageProcessor: NgDocPageProcessor<ImageViewerComponent> = {
	component: ImageViewerComponent,
	selector: 'img',
	extractOptions: (element: Element) => ({
		inputs: {
			src: element.getAttribute('src') || '',
			alt: element.getAttribute('alt') || '',
			title: element.getAttribute('title') || undefined,
		},
	}),
};
