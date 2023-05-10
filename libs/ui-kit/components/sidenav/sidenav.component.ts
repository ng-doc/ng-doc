import {animate, AnimationEvent, state, style, transition, trigger} from '@angular/animations';
import {ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output} from '@angular/core';
import {NgDocContent, NgDocHorizontalAlign} from '@ng-doc/ui-kit/types';

@Component({
	animations: [
		trigger('sidenavAnimation', [
			state('false', style({display: 'none'})),
			transition('left => false', [
				style({transform: 'translateX(0)', opacity: 1}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(-100%)', opacity: 0})),
			]),
			transition('false => left', [
				style({transform: 'translateX(-100%)', opacity: 0, display: 'block'}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(0)', opacity: 1})),
			]),
			transition('right => false', [
				style({transform: 'translateX(0)', opacity: 1}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(100%)', opacity: 0})),
			]),
			transition('false => right', [
				style({transform: 'translateX(100%)', opacity: 0, display: 'block'}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(0)', opacity: 1})),
			]),
		]),
		trigger('sidenavContentAnimation', [
			state(
				'true',
				style({
					'margin-left': 'var(--ng-doc-sidenav-width)',
					width: 'calc(100% - var(--ng-doc-sidenav-width))',
				}),
			),
			state('false', style({'margin-left': '0', width: '100%'})),
			transition('true => false', animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)')),
			transition('false => true', animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)')),
		]),
		trigger('backdropFade', [
			transition(':enter', [
				style({opacity: 0}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({opacity: 1})),
			]),
		]),
	],
	selector: 'ng-doc-sidenav',
	templateUrl: './sidenav.component.html',
	styleUrls: ['./sidenav.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidenavComponent {
	/**
	 * Content of the sidenav.
	 */
	@Input()
	sidebar: NgDocContent = '';

	/**
	 * Align of the sidenav.
	 */
	@Input()
	@HostBinding('attr.data-ng-doc-align')
	align: NgDocHorizontalAlign = 'left';

	/**
	 * Indicates whether the sidenav is over the page content or not.
	 * Which means that the sidenav is not part of the page content.
	 */
	@Input()
	@HostBinding('attr.data-ng-doc-over')
	over: boolean = false;

	/**
	 * Indicates whether the sidenav is opened or not.
	 * This is used to trigger the animation.
	 */
	@Input()
	@HostBinding('attr.data-ng-doc-opened')
	opened: boolean = true;

	/**
	 * Indicates whether the sidenav has a backdrop or not.
	 */
	@Input()
	hasBackdrop: boolean = true;

	@Output()
	openedChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	@Output()
	closeEvent: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	beforeOpen: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	beforeClose: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	afterOpen: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	afterClose: EventEmitter<void> = new EventEmitter<void>();

	protected get backdrop(): boolean {
		return this.over && this.opened && this.hasBackdrop;
	}

	protected animationStart(event: AnimationEvent): void {
		(!!event.toState as unknown as boolean) ? this.beforeOpen.emit() : this.beforeClose.emit();
	}

	protected animationDone(event: AnimationEvent): void {
		(!!event.toState as unknown as boolean) ? this.afterOpen.emit() : this.afterClose.emit();
	}
}
