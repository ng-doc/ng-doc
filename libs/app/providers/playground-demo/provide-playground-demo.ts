import { InjectionToken, Provider } from '@angular/core';
import { Constructor } from '@ng-doc/core';

const tokenStore: Map<string, InjectionToken<unknown>> = new Map<string, InjectionToken<unknown>>();

/**
 *
 * @param type
 * @param control
 * @param options
 * @param playgroundId
 * @param selector
 * @param component
 */
export function providePlaygroundDemo(
	playgroundId: string,
	component: Constructor<unknown>,
): Provider {
	const token: InjectionToken<unknown> =
		tokenStore.get(playgroundId) ??
		new InjectionToken<unknown>(`NG_DOC_PLAYGROUND_DEMO_${playgroundId}`);

	tokenStore.set(playgroundId, token);

	return {
		provide: token,
		useValue: component,
		multi: true,
	};
}

/**
 * Returns the token for the given playground id.
 * @param playgroundId
 */
export function getPlaygroundDemoToken<T>(playgroundId: string): InjectionToken<T[]> | undefined {
	return tokenStore.get(playgroundId) as InjectionToken<T[]> | undefined;
}
