import {animate, style, transition, trigger} from '@angular/animations';
import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, OnChanges} from '@angular/core';

@Component({
	animations: [
		trigger('resizeAnimation', [
			transition('void <=> *', []),
			transition('* <=> *', [
				style({height: '{{startHeight}}px', width: '{{startWidth}}px', opacity: '{{startOpacity}}'}),
				animate('.225s ease-in-out'),
			]),
		]),
	],
	selector: 'ng-doc-smooth-resize',
	template: ` <ng-content></ng-content>`,
	styles: [
		`
			:host {
				display: block;
				overflow: hidden;
				height: var(--ng-doc-smooth-resize-height);
				max-height: var(--ng-doc-smooth-resize-max-height);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocSmoothResizeComponent implements OnChanges {
	@Input()
	trigger: unknown;

	@Input()
	animateOpacity: boolean = true;

	@HostBinding('@resizeAnimation')
	resizeAnimation?: {
		value: unknown;
		params: {startHeight: number; startWidth: number; startOpacity: number};
	} = {
		value: 0,
		params: {startHeight: 0, startWidth: 0, startOpacity: 0},
	};

	constructor(private readonly element: ElementRef<HTMLElement>) {}

	ngOnChanges(): void {
		this.resizeAnimation = {
			value: this.trigger,
			params: {
				startHeight: this.element.nativeElement.clientHeight,
				startWidth: this.element.nativeElement.clientWidth,
				startOpacity: this.animateOpacity ? 0 : 1,
			},
		};
	}
}
