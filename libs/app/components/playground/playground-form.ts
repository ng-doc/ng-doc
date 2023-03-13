import {FormControl, FormGroup} from '@angular/forms';
import {NgDocExtractedValue} from '@ng-doc/core/types';

export interface NgDocPlaygroundForm {
	properties: FormGroup<Record<string, FormControl<NgDocExtractedValue>>>;
	content: FormGroup<Record<string, FormControl<boolean>>>;
}
