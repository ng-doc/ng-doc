import {InjectionToken} from '@angular/core';
import {FlControl} from 'flex-controls';

export const NG_DOC_INPUT_CONTROL: InjectionToken<FlControl<unknown>> = new InjectionToken<FlControl<unknown>>(
	'NG_DOC_INPUT_CONTROL',
);
