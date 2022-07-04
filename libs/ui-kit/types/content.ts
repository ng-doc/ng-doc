import {Injector, StaticProvider, TemplateRef, Type} from '@angular/core';
import {
	POLYMORPHEUS_CONTEXT,
	PolymorpheusComponent,
	PolymorpheusHandler,
	PolymorpheusPrimitive,
	PolymorpheusTemplate,
} from '@tinkoff/ng-polymorpheus';

// eslint-disable-next-line @typescript-eslint/ban-types
export type NgDocContent<C extends object = {}> =
	| PolymorpheusPrimitive
	| TemplateRef<C>
	| PolymorpheusTemplate<C>
	| PolymorpheusHandler<C>
	| NgDocComponentContent<object, C>;

// eslint-disable-next-line @typescript-eslint/ban-types
export class NgDocComponentContent<T extends object, C extends object = object> extends PolymorpheusComponent<T, C> {
	constructor(override readonly component: Type<T>, readonly injectorRef?: Injector) {
		super(component);
	}

	override createInjector(injector: Injector, context: C, providers: StaticProvider[] = []): Injector {
		return Injector.create({
			parent: this.injectorRef || injector,
			providers: [
				{
					provide: POLYMORPHEUS_CONTEXT,
					useValue: context,
				},
				...providers,
			],
		});
	}
}
