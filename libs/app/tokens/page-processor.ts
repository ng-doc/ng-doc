import { InjectionToken, Provider } from '@angular/core';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';

export const NG_DOC_PAGE_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
  new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_PROCESSOR');
export const NG_DOC_PAGE_CUSTOM_PROCESSOR: InjectionToken<NgDocPageProcessor<unknown>> =
  new InjectionToken<NgDocPageProcessor<unknown>>('NG_DOC_PAGE_CUSTOM_PROCESSOR');

/**
 * Provide a main processor to replace html nodes with an Angular component.
 * Main processors are run before custom processors.
 * @param processors - The processor to provide.
 */
export function provideMainPageProcessor(
  processors: NgDocPageProcessor<unknown> | Array<NgDocPageProcessor<unknown>>,
): Provider[] {
  return asArray(processors).map((processor) => ({
    provide: NG_DOC_PAGE_PROCESSOR,
    useValue: processor,
    multi: true,
  }));
}

/**
 * Provide a processor to replace html nodes with an Angular component.
 * @param processors - The processor to provide.
 */
export function providePageProcessor<T>(
  processors: NgDocPageProcessor<T> | Array<NgDocPageProcessor<T>>,
): Provider[] {
  return asArray(processors).map((processor) => ({
    provide: NG_DOC_PAGE_CUSTOM_PROCESSOR,
    useValue: processor,
    multi: true,
  }));
}
