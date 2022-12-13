import {animate, AnimationTriggerMetadata, style, transition, trigger} from '@angular/animations';

export const fadeAnimation: AnimationTriggerMetadata = trigger('fadeAnimation', [
	transition(':enter', [style({opacity: 0}), animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({opacity: 1}))]),
	transition(':leave', [style({opacity: 1}), animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({opacity: 0}))]),
]);
