import {ControlValueAccessor} from '@angular/forms';

export interface NgDocTypeControl extends ControlValueAccessor {
	default?: string;
	options?: string[];
}
