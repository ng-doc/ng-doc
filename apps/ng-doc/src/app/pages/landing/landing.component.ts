import {AfterViewInit, ChangeDetectionStrategy, Component} from '@angular/core';
import highlight from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';

highlight.registerLanguage('bash', bash);
@Component({
	selector: 'ng-doc-landing',
	templateUrl: './landing.component.html',
	styleUrls: ['./landing.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements AfterViewInit {
	ngAfterViewInit(): void {
		console.log('asd');
		// const tl2 = anime.timeline({autoplay: false});
		//
		// // Add animations
		// const s2a1 = {
		// 	targets: '#api-docs h2',
		// 	opacity: [0.3, 1],
		// 	scale: [4, 1],
		// 	duration: 1000,
		// 	delay: 0,
		// 	easing: 'easeInOutSine',
		// };
		//
		// const s2a2 = {
		// 	targets: '#api-docs h2',
		// 	scale: 1,
		// 	duration: 2000,
		// };
		//
		// // Add children
		// tl2.add(s2a1).add(s2a2);
		//
		// // eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// // @ts-ignore
		// new ScrollMagic.Scene({
		// 	triggerElement: '#api-docs',
		// 	duration: 4500,
		// 	triggerHook: 0,
		// })
		//
		// 	// Add debug indicators
		// 	.addIndicators({
		// 		colorTrigger: 'black',
		// 		colorStart: 'blue',
		// 		colorEnd: 'red',
		// 		indent: 10,
		// 	})
		//
		// 	// Trigger animation timeline
		// 	//Use scroll position to play animation
		// 	.on('progress', function (event: any) {
		// 		tl2.seek(tl2.duration * event.progress);
		// 	})
		// 	.setPin('#api-docs')
		// 	.addTo(this.controller);
	}
}
