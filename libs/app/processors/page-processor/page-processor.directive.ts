import {
	ComponentRef,
	Directive,
	ElementRef,
	inject,
	Injector,
	Input,
	OnInit,
	Renderer2,
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
	host: { ngSkipHydration: 'true' },
})
export class NgDocPageProcessorDirective implements OnInit {
	@Input({ required: true, alias: 'ngDocPageProcessor' })
	html: string = '';

	processors: Array<NgDocPageProcessor<unknown>> =
		inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_PROCESSOR, { optional: true }) ?? [];
	customProcessors: Array<NgDocPageProcessor<unknown>> =
		inject<Array<NgDocPageProcessor<unknown>>>(NG_DOC_PAGE_CUSTOM_PROCESSOR, { optional: true }) ??
		[];

	protected readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
	protected readonly viewContainerRef: ViewContainerRef = inject(ViewContainerRef);
	protected readonly injector: Injector = inject(Injector);
	protected readonly renderer: Renderer2 = inject(Renderer2);

	ngOnInit(): void {
		this.renderer.setProperty(this.elementRef.nativeElement, 'innerHTML', this.html);

		asArray(this.processors, this.customProcessors).forEach(this.process.bind(this));
	}

	private process<T>(processor: NgDocPageProcessor<T>): void {
		Array.from(this.elementRef.nativeElement.querySelectorAll(processor.selector)).forEach(
			(elementNode: Element) => {
				// check if element node has a parent node because it can be removed by another processor
				if (elementNode.parentNode) {
					const replaceElement: Element =
						(processor.nodeToReplace && processor.nodeToReplace(elementNode, this.injector)) ??
						elementNode;
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
			},
		);
	}
}
