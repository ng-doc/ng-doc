import {ElementRef} from '@angular/core';
import {BaseElement} from '@ng-doc/ui-kit/types';

/**
 * @param element
 */
export function toElement<T extends Element>(element: BaseElement<T>): T {
	return element instanceof ElementRef ? element.nativeElement : element;
}
