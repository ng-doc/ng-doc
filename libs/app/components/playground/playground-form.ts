import { FormControl, FormGroup } from '@angular/forms';

export interface NgDocPlaygroundForm {
	properties: FormGroup<Record<string, FormControl<unknown>>>;
	content: FormGroup<Record<string, FormControl<boolean>>>;
}
