import {Point} from '@angular/cdk/drag-drop';

export class NgDocPositionUtils {
	/**
	 * Getting the position of the element relative to the viewPort, this function is faster than BoundingClientRect,
	 * it also takes into account the change in the position of the element through transform
	 *
	 * @param element
	 */
	static getElementPosition(element: HTMLElement | null): Point {
		let xPos: number = 0;
		let yPos: number = 0;

		while (element) {
			if (element === document.body) {
				const documentElement: HTMLElement = document.documentElement;
				xPos += documentElement.offsetLeft - documentElement.scrollLeft + documentElement.clientLeft;
				yPos += documentElement.offsetTop - documentElement.scrollTop + documentElement.clientTop;
				element = null;
			} else {
				const elementMatrix: DOMMatrix = new DOMMatrix(element.style.transform);
				xPos += element.offsetLeft - element.scrollLeft + element.clientLeft + elementMatrix.m41;
				yPos += element.offsetTop - element.scrollTop + element.clientTop + elementMatrix.m42;
				element = NgDocPositionUtils.getOffsetParent(element) as HTMLElement;
			}
		}
		return {x: xPos, y: yPos};
	}

	/**
	 * An implementation of the element.offsetParent function, this implementation closes a bug in Firefox when it
	 * returns an offsetParent for elements with position: fixed
	 *
	 * @param element
	 */
	static getOffsetParent(element: HTMLElement): HTMLElement | null {
		const computerStyles: CSSStyleDeclaration = getComputedStyle(element);
		if (computerStyles.position === 'fixed' || computerStyles.display === 'none') {
			return null;
		}
		return element.offsetParent as HTMLElement;
	}
}
