import {InjectionToken} from '@angular/core';
import {NgDocApiList} from '@ng-doc/core';

export const NG_DOC_API_LIST_TOKEN: InjectionToken<NgDocApiList[]> = new InjectionToken<NgDocApiList[]>(
	'API_LIST_TOKEN',
);
