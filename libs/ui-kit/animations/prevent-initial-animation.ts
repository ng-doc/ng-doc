import {AnimationTriggerMetadata, transition, trigger} from '@angular/animations';

export const preventInitialChildAnimations: AnimationTriggerMetadata = trigger('preventInitialChild', [
	transition(':enter', []),
]);
