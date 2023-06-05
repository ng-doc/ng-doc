import {Directive, Input, Type, ViewContainerRef} from '@angular/core';
import {NgDocPlaygroundConfig} from '@ng-doc/core/interfaces';

/**
 * Base class for playgrounds components.
 */
@Directive()
export abstract class NgDocBasePlayground implements Pick<NgDocPlaygroundConfig, 'data'> {
	static readonly selector: string = 'unknown';
	abstract readonly playground?: Type<unknown>;
	abstract readonly viewContainerRef?: ViewContainerRef;

	@Input()
	properties: Record<string, any> = {};

	@Input()
	data: Record<string, any> = {};

	@Input()
	content: any = {};
}
