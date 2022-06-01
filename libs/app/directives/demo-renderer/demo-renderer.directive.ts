import {ComponentRef, Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocDemoViewerComponent} from '@ng-doc/app/components/demo-viewer';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';

@Directive({
	selector: '[ngDocDemoRenderer]',
})
@UntilDestroy()
export class NgDocDemoRendererDirective {
	private demoReferences: Array<ComponentRef<NgDocDemoViewerComponent>> = [];

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly viewContainerRef: ViewContainerRef,
		@Self()
		private readonly markdown: NgDocMarkdownDirective,
	) {
		this.markdown.rendered.pipe(untilDestroyed(this)).subscribe(() => {
			let commentNode: CharacterData | undefined;

			// clear previous demo references
			this.demoReferences.forEach((demoRef: ComponentRef<NgDocDemoViewerComponent>) => demoRef.destroy());
			this.demoReferences = [];

			while ((commentNode = this.findComments(this.elementRef.nativeElement, /(NgDocDemo:)([\s\S]*)/))) {
				if (commentNode) {
					// create host node to create demo component inside
					const hostNode: HTMLElement = document.createElement('div');

					this.insertAfter(commentNode, hostNode);

					// search for demo point in markdown output
					const demoPoint: RegExpMatchArray | null = commentNode.data.match(/(NgDocDemo:)([\s\S]*)?/);

					if (demoPoint) {
						// get name of the component that we should render
						const demoComponentName: string = demoPoint[2].trim();

						// create demo viewer component
						const componentRef: ComponentRef<NgDocDemoViewerComponent> =
							this.viewContainerRef.createComponent(NgDocDemoViewerComponent);

						componentRef.instance.componentName = demoComponentName;

						// add demo reference to the list to destroy it later
						this.demoReferences.push(componentRef);

						// replace comment node with host node with demo component
						commentNode.parentNode?.replaceChild(componentRef.location.nativeElement, commentNode);
					}
				}
			}
		});
	}

	private insertAfter(referenceNode: Node, newNode: Node): void {
		referenceNode.parentNode?.insertBefore(newNode, referenceNode.nextSibling);
	}

	private findComments(node: ChildNode, text: string | RegExp): CharacterData | undefined {
		for (const child of Array.from(node.childNodes)) {
			const match: RegExpMatchArray | null = (child as CharacterData).data?.match(text);

			if (child.nodeType === 8 && match && match[0]) {
				return child as CharacterData;
			} else if (this.findComments(child, text)) {
				return this.findComments(child, text);
			}
		}

		return undefined;
	}
}
