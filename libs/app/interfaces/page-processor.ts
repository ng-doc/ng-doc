import {Type} from '@angular/core';

import {NgDocProcessorOptions} from './processor-options';

/**
 * Interface to create a processor that will be used to replace html nodes with an Angular component.
 */
export interface NgDocPageProcessor<T> {
	/**
	 * Target component to replace html nodes with.
	 */
	component: Type<T>;
	/**
	 * Selector to find html nodes to replace.
	 */
	selector: string;
	/**
	 * Extract options for Angular component from html node.
	 *
	 * @param element - Html node to extract options from.
	 * @param root - Root html node.
	 */
	extractOptions: (element: Element, root: HTMLElement) => NgDocProcessorOptions<T>;
	/**
	 * Can be used to find a node to replace instead of the node that was found by selector.
	 *
	 * @param element - Html node to replace.
	 */
	nodeToReplace?: (element: Element) => Element;
}
