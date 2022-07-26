import {AbstractControl, FormArray, FormControl, FormGroup} from '@angular/forms';

export type NgDocFormPartialValue<T extends AbstractControl> = T extends FormArray<infer FA>
	? Array<NgDocFormPartialValue<FA>>
	: T extends FormGroup<infer FG>
	? Partial<{[K in keyof FG]: NgDocFormPartialValue<FG[K]>}>
	: T extends FormControl<infer FC>
	? FC
	: never;
