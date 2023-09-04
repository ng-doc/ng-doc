import { Constructor } from '@ng-doc/core/types/constructor';

import { NgDocTypeControl } from './type-control';
import { NgDocTypeControlProviderOptions } from './type-control-provider-options';

export interface NgDocProvidedTypeControl {
	control: Constructor<NgDocTypeControl>;
	options?: NgDocTypeControlProviderOptions;
}
