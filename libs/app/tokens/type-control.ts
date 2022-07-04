import {InjectionToken} from '@angular/core';

import {NgDocTypeControl} from '../interfaces';

export const NG_DOC_TYPE_CONTROL: InjectionToken<NgDocTypeControl<unknown>> = new InjectionToken<
	NgDocTypeControl<unknown>
>('NG_DOC_TYPE_CONTROL');
