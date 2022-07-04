import {InjectionToken, Provider} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {Constructor} from '@ng-doc/ui-kit';

const tokenStore: Map<string, InjectionToken<Constructor<NgDocTypeControl<any>>>> = new Map<
	string,
	InjectionToken<Constructor<NgDocTypeControl<any>>>
>();

/**
 *
 * @param type
 * @param control
 */
export function provideTypeControl<T>(type: string, control: Constructor<NgDocTypeControl<T>>): Provider {
	const token: InjectionToken<Constructor<NgDocTypeControl<T>>> = new InjectionToken<
		Constructor<NgDocTypeControl<T>>
	>(`NG_DOC_TYPE_CONTROL_${type}`);
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
export function getTokenForType<T>(type: string): InjectionToken<Constructor<NgDocTypeControl<T>>> | undefined {
	return tokenStore.get(type);
}
