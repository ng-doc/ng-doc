import {animate, AnimationMetadata, style} from '@angular/animations';

export const dropdownOpenAnimation: AnimationMetadata[] = [
	style({transform: 'scale(0.9)', opacity: 0}),
	animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'scale(1)', opacity: 1})),
];

export const dropdownCloseAnimation: AnimationMetadata[] = [
	style({transform: 'scaleY(1)', opacity: 1}),
	animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'scaleY(0.9)', opacity: 0})),
];

export const tooltipOpenAnimation: AnimationMetadata[] = [
	style({transform: 'scale(0.8)', opacity: 0}),
	animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'scale(1)', opacity: 1})),
];

export const tooltipCloseAnimation: AnimationMetadata[] = [
	style({transform: 'scale(1)', opacity: 1}),
	animate('120ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'scale(0.8)', opacity: 0})),
];
