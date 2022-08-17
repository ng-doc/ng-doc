import {InjectionToken, Provider} from '@angular/core';
import {NgDocApiDisplayer} from '@ng-doc/app/interfaces';
import {Constructor, NgDocExportedDeclarationKind} from '@ng-doc/core';

const tokenStore: Map<NgDocExportedDeclarationKind, InjectionToken<Constructor<NgDocApiDisplayer>>> = new Map<
	NgDocExportedDeclarationKind,
	InjectionToken<Constructor<NgDocApiDisplayer>>
>();

/**
 *
 * @param type
 * @param control
 */
export function provideApiDisplayer<T>(
	type: NgDocExportedDeclarationKind,
	control: Constructor<NgDocApiDisplayer>,
): Provider {
	const token: InjectionToken<Constructor<NgDocApiDisplayer>> = new InjectionToken<Constructor<NgDocApiDisplayer>>(
		`NG_DOC_API_DISPLAYER_${type}`,
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
export function getApiDisplayerToken<T>(
	type: NgDocExportedDeclarationKind,
): InjectionToken<Constructor<NgDocApiDisplayer>> | undefined {
	return tokenStore.get(type);
}
