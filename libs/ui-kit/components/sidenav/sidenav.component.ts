import {animate, state, style, transition, trigger} from '@angular/animations';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	EventEmitter,
	HostBinding,
	Input,
	Output,
} from '@angular/core';
import {fadeAnimation} from '@ng-doc/ui-kit/animations';
import {NgDocContent} from '@ng-doc/ui-kit/types';

@Component({
	animations: [
		trigger('sidenavAnimation', [
			state('false', style({display: 'none'})),
			transition('true => false', [
				style({transform: 'translateX(0)', opacity: 1}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(-100%)', opacity: 0})),
			]),
			transition('false => true', [
				style({transform: 'translateX(-100%)', opacity: 0, display: 'block'}),
				animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({transform: 'translateX(0)', opacity: 1})),
			]),
		]),
		// Only for not floating sidenav
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
		fadeAnimation,
	],
	selector: 'ng-doc-sidenav',
	templateUrl: './sidenav.component.html',
	styleUrls: ['./sidenav.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidenavComponent {
	@Input()
	sidebar: NgDocContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-floating')
	floating: boolean = false;

	@Input()
	@HostBinding('attr.data-ng-doc-opened')
	opened: boolean = true;

	@Output()
	openedChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

	get hasBackdrop(): boolean {
		return this.floating && this.opened;
	}

	open(): void {
		this.opened = true;
		this.openedChange.emit(this.opened);
		this.changeDetectorRef.markForCheck();
	}

	close(): void {
		this.opened = false;
		this.openedChange.emit(this.opened);
		this.changeDetectorRef.markForCheck();
	}

	toggle(): void {
		this.opened ? this.close() : this.open();
	}
}
