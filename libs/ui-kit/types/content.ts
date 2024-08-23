import { Injector, TemplateRef, Type } from '@angular/core';
import { NG_DOC_COMPONENT_CONTEXT } from '@ng-doc/ui-kit/tokens';
import {
	PolymorpheusComponent,
	PolymorpheusHandler,
	PolymorpheusTemplate,
} from '@tinkoff/ng-polymorpheus';

// eslint-disable-next-line @typescript-eslint/ban-types
export type NgDocContent<C extends object = {}> =
	| string
	| number
	| null
	| undefined
	| TemplateRef<C>
	| PolymorpheusTemplate<C>
	| PolymorpheusHandler<C>
	| NgDocComponentContent<object, C>;

// eslint-disable-next-line @typescript-eslint/ban-types
export class NgDocComponentContent<
	T extends object,
	C extends object = object,
> extends PolymorpheusComponent<T, C> {
	constructor(
		override readonly component: Type<T>,
		readonly injectorRef?: Injector,
	) {
		super(component);
	}

	override createInjector<C>(injector: Injector, useValue?: C): Injector {
		return Injector.create({
			parent: this.injectorRef || injector,
			providers: [
				{
					provide: NG_DOC_COMPONENT_CONTEXT,
					useValue,
				},
			],
		});
	}
}
