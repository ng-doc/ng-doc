import {Provider} from '@angular/core';
import {NG_DOC_CONTEXT} from '@ng-doc/app/tokens';

export const ngDocContextProvider: Provider = {
	provide: NG_DOC_CONTEXT,
	useValue: {},
};
