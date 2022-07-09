import {AfterViewInit, Directive, Type, ViewContainerRef} from '@angular/core';

@Directive()
export abstract class NgDocPlaygroundWrapper<T> implements AfterViewInit {
	abstract readonly selector: string;
	abstract readonly template: string;
	abstract readonly component: Type<T>;
	abstract readonly viewContainerRef: ViewContainerRef;

	protected constructor() {}

	ngAfterViewInit(): void {
		this.viewContainerRef.createComponent(this.component);
	}
}
