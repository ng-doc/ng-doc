import { InjectionToken, Provider } from '@angular/core';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core';

export const NG_DOC_PAGE_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
	new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_PROCESSOR');
export const NG_DOC_PAGE_CUSTOM_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
	new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_CUSTOM_PROCESSOR');

/**
 * Provide a processor to replace html nodes with an Angular component.
 *
 * @param processors - The processor to provide.
 * @param override - Whether to override existing processors.
 */
export function providePageProcessor<T>(
	processors: NgDocPageProcessor<T> | Array<NgDocPageProcessor<T>>,
	override?: boolean,
): Provider[] {
	return asArray(processors).map((processor) => ({
		provide: override ? NG_DOC_PAGE_PROCESSOR : NG_DOC_PAGE_CUSTOM_PROCESSOR,
		useValue: processor,
		multi: true,
	}));
}
