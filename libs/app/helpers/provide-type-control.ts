import {InjectionToken, Provider} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {Constructor} from '@ng-doc/core';

const tokenStore: Map<string, InjectionToken<Constructor<NgDocTypeControl>>> = new Map<
	string,
	InjectionToken<Constructor<NgDocTypeControl>>
>();

/**
 *
 * @param type
 * @param control
 */
export function provideTypeControl<T>(type: string, control: Constructor<NgDocTypeControl>): Provider {
	const token: InjectionToken<Constructor<NgDocTypeControl>> = new InjectionToken<Constructor<NgDocTypeControl>>(
		`NG_DOC_TYPE_CONTROL_${type}`,
	);
	tokenStore.set(type, token);

	return {
		provide: token,
		useValue: control,
	};
}

/**
 *
 * @param type
 */
export function getTokenForType<T>(type: string): InjectionToken<Constructor<NgDocTypeControl>> | undefined {
	return tokenStore.get(type);
}
