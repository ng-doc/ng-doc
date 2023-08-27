import {
	ComponentRef,
	Directive,
	ElementRef,
	inject,
	Injector,
	OnInit,
	ViewContainerRef,
} from '@angular/core';
import { NgDocPageProcessor, NgDocProcessorOptions } from '@ng-doc/app/interfaces';
import { NG_DOC_PAGE_CUSTOM_PROCESSOR, NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { asArray, objectKeys } from '@ng-doc/core';

/**
 * Base processor class to create a processor directive that will be used to replace
 * html nodes with an Angular component.
 */
@Directive({
	selector: '[ngDocPageProcessor]',
	standalone: true,
})
export class NgDocPageProcessorDirective implements OnInit {
	processors: Array<NgDocPageProcessor<unknown>> =
		inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_PROCESSOR, { optional: true }) ?? [];
	customProcessors: Array<NgDocPageProcessor<unknown>> =
		inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_CUSTOM_PROCESSOR, { optional: true }) ??
		[];
	injector: Injector = inject(Injector);

	constructor(
		protected readonly elementRef: ElementRef<HTMLElement>,
		protected readonly viewContainerRef: ViewContainerRef,
	) {}

	ngOnInit(): void {
		asArray(this.processors, this.customProcessors).forEach(this.process.bind(this));
	}

	private process<T>(processor: NgDocPageProcessor<T>): void {
		this.elementRef.nativeElement
			.querySelectorAll(processor.selector)
			.forEach((elementNode: Element) => {
				// check if element node has a parent node because it can be removed by another processor
				if (elementNode.parentNode) {
					const replaceElement: Element =
						(processor.nodeToReplace && processor.nodeToReplace(elementNode)) ?? elementNode;
					const options: NgDocProcessorOptions<T> = processor.extractOptions(
						elementNode,
						this.elementRef.nativeElement,
					);

					// create component
					const componentRef: ComponentRef<T> = this.viewContainerRef.createComponent(
						processor.component,
						{
							projectableNodes: options.content,
							injector: this.injector,
						},
					);

					// set component options
					if (options.inputs) {
						objectKeys(options.inputs).forEach(
							(key: keyof T) =>
								options.inputs && componentRef.setInput(key as string, options.inputs[key]),
						);
					}

					// replace element node with component node
					replaceElement.parentNode?.replaceChild(
						componentRef.location.nativeElement,
						replaceElement,
					);

					componentRef.changeDetectorRef.markForCheck();
				}
			});
	}
}
