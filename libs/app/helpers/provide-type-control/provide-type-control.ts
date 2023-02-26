import {InjectionToken, Provider} from '@angular/core';
import {NgDocProvidedTypeControl, NgDocTypeControl, NgDocTypeControlProviderOptions} from '@ng-doc/app/interfaces';
import {Constructor} from '@ng-doc/core/types/constructor';

const tokenStore: Map<string, InjectionToken<NgDocProvidedTypeControl>> = new Map<
	string,
	InjectionToken<NgDocProvidedTypeControl>
>();

/**
 *
 * @param type
 * @param control
 * @param options
 */
export function provideTypeControl(
	type: string,
	control: Constructor<NgDocTypeControl>,
	options?: NgDocTypeControlProviderOptions,
): Provider {
	const token: InjectionToken<NgDocProvidedTypeControl> = new InjectionToken<NgDocProvidedTypeControl>(
		`NG_DOC_TYPE_CONTROL_${type}`,
	);
	tokenStore.set(type, token);

	return {
		provide: token,
		useValue: {
			control,
			options,
		},
	};
}

/**
 * Returns token for type control based on provided type
 *
 * @param type - type for searched control (e.g. `string`)
 */
export function getTokenForType(type: string): InjectionToken<NgDocProvidedTypeControl> | undefined {
	return tokenStore.get(type);
}
