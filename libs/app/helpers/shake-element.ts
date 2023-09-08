/**
 *
 * @param element
 */
export function shakeElement(element: Element): void {
	element.animate(
		[
			{ transform: 'translateX(0)' },
			{ transform: 'translateX(-3px)' },
			{ transform: 'translateX(3px)' },
		],
		{
			duration: 200,
			iterations: 4,
			fill: 'both',
			easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
		},
	);
}
