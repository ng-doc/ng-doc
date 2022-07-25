import {FormControl, FormGroup} from '@angular/forms';

export type NgDocTypedForm<T extends object | object[]> = {
	[K in keyof T]: T[K] extends object ? FormGroup<NgDocTypedForm<T[K]>> : FormControl<T[K]>;
};
