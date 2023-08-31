import {
	animate,
	AnimationTriggerMetadata,
	state,
	style,
	transition,
	trigger,
} from '@angular/animations';

export const expandCollapseAnimation: AnimationTriggerMetadata = trigger('expandCollapse', [
	transition(
		':enter',
		[
			style({ opacity: '{{opacity}}', height: '{{from}}' }),
			animate('225ms cubic-bezier(0.4,0.0,0.2,1)', style({ opacity: 1, height: '*' })),
		],
		{ params: { from: 0, opacity: 0 } },
	),
	transition(
		':leave',
		[
			style({ opacity: 1, height: '*' }),
			animate(
				'225ms cubic-bezier(0.4,0.0,0.2,1)',
				style({
					opacity: '{{opacity}}',
					height: '{{from}}',
				}),
			),
		],
		{ params: { from: 0, opacity: 0 } },
	),
	state('true', style({ opacity: 1, height: '*' })),
	state('false', style({ opacity: '{{opacity}}', height: '{{from}}' }), {
		params: {
			from: 0,
			opacity: 0,
		},
	}),
	transition('* => true', [animate('225ms cubic-bezier(0.4,0.0,0.2,1)')]),
	transition('* => false', [animate('225ms cubic-bezier(0.4,0.0,0.2,1)')]),
]);
