import {ControlValueAccessor} from '@angular/forms';

export interface NgDocTypeControl extends ControlValueAccessor {
	name?: string;
	description?: string;
	default?: string;
	options?: string[];
}
