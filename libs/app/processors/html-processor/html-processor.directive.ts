import {ComponentRef, Directive, ElementRef, inject, Injector, OnInit, Type, ViewContainerRef} from '@angular/core';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';

/**
 * Base processor class to create a processor directive that will be used to replace
 * html nodes with an Angular component.
 */
@Directive()
export abstract class NgDocHtmlProcessor<T> implements OnInit {
	injector: Injector = inject(Injector);

	protected constructor(
		protected readonly elementRef: ElementRef<HTMLElement>,
		protected readonly viewContainerRef: ViewContainerRef,
		protected readonly selector: string,
		protected readonly component: Type<T>,
	) {}

	ngOnInit(): void {
		this.elementRef.nativeElement.querySelectorAll(this.selector).forEach((elementNode: Element) => {
			const options: NgDocProcessorOptions<T> = this.extractComponentOptions(elementNode);

			// create component
			const componentRef: ComponentRef<T> = this.viewContainerRef.createComponent(this.component, {
				projectableNodes: options.content,
				injector: this.injector,
			});

			// set component options
			Object.assign(componentRef.instance as object, options.inputs);

			// replace element node with component node
			const replaceElement: Element = this.replaceElement(elementNode);
			replaceElement.parentNode?.replaceChild(componentRef.location.nativeElement, replaceElement);

			componentRef.changeDetectorRef.markForCheck();
		});
	}

	protected replaceElement(element: Element): Element {
		return element;
	}

	protected abstract extractComponentOptions(element: Element): NgDocProcessorOptions<T>;
}
