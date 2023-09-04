import { InjectionToken } from '@angular/core';
import { NgDocContext } from '@ng-doc/app/interfaces';

export const NG_DOC_CONTEXT: InjectionToken<NgDocContext> = new InjectionToken<NgDocContext>(
	'NG_DOC_CONTEXT',
);
