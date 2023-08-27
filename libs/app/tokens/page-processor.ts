import { InjectionToken, Provider } from '@angular/core';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const NG_DOC_PAGE_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
	new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_PROCESSOR');
export const NG_DOC_PAGE_CUSTOM_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
	new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_CUSTOM_PROCESSOR');

/**
 * Provide a processor to replace html nodes with an Angular component.
 *
 * @param processor - Processor to provide.
 */
export function providePageProcessor<T>(processor: NgDocPageProcessor<T>): Provider {
	return {
		provide: NG_DOC_PAGE_CUSTOM_PROCESSOR,
		useValue: processor,
		multi: true,
	};
}
