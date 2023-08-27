import { Type, ViewContainerRef } from '@angular/core';

/**
 *
 * @param viewContainer
 * @param component
 * @param inputs
 */
export function createComponent<T>(
	viewContainer: ViewContainerRef,
	component: Type<T>,
	inputs?: object,
): void {
	const componentRef = viewContainer.createComponent(component);

	if (inputs) {
		Object.entries(inputs).forEach(([key, value]) => {
			componentRef.setInput(key, value);
		});
	}

	componentRef.changeDetectorRef.detectChanges();
}
