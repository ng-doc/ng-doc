import {AnimationBuilder, AnimationMetadata, AnimationPlayer} from '@angular/animations';
import {ConnectedOverlayPositionChange, FlexibleConnectedPositionStrategy} from '@angular/cdk/overlay';
import {DOCUMENT} from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	Inject,
	NgZone,
	OnDestroy,
	OnInit,
	ViewChild,
} from '@angular/core';
import {NgDocFocusCatcherDirective} from '@ng-doc/ui-kit/directives/focus-catcher';
import {toElement} from '@ng-doc/ui-kit/helpers';
import {NgDocOverlayConfig, NgDocOverlayContainer} from '@ng-doc/ui-kit/interfaces';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit/observables';
import {
	NgDocHorizontalAlign,
	NgDocOverlayAnimationEvent,
	NgDocOverlayPosition,
	NgDocOverlayRelativePosition,
	NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';
import {NgDocFocusUtils, NgDocOverlayUtils} from '@ng-doc/ui-kit/utils';
import {PolymorpheusContent, PolymorpheusOutletDirective} from '@tinkoff/ng-polymorpheus';
import {Observable, Subject} from 'rxjs';
import {distinctUntilChanged} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-overlay-container',
	templateUrl: './overlay-container.component.html',
	styleUrls: ['./overlay-container.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocOverlayContainerComponent implements NgDocOverlayContainer, OnInit, OnDestroy {
	@ViewChild('contentContainer', {read: ElementRef, static: true})
	contentContainer?: ElementRef<HTMLElement>;

	@ViewChild(NgDocFocusCatcherDirective)
	focusCatcher?: NgDocFocusCatcherDirective;

	@ViewChild(PolymorpheusOutletDirective, {static: true})
	outlet?: PolymorpheusOutletDirective<object>;

	@HostBinding('attr.data-ng-doc-overlay-position')
	relativePosition: NgDocOverlayRelativePosition | null = null;

	config?: NgDocOverlayConfig;
	content: PolymorpheusContent = '';

	private currentPosition?: NgDocOverlayPosition;
	private animationEvent$: Subject<NgDocOverlayAnimationEvent> = new Subject<NgDocOverlayAnimationEvent>();
	private isOpened: boolean = true;

	constructor(
		private elementRef: ElementRef<HTMLElement>,
		@Inject(DOCUMENT) private documentRef: Document,
		private changeDetectorRef: ChangeDetectorRef,
		private ngZone: NgZone,
		private animationBuilder: AnimationBuilder,
	) {}

	ngOnInit(): void {
		this.runAnimation(this.config?.openAnimation || []);
		if (this.config?.positionStrategy instanceof FlexibleConnectedPositionStrategy) {
			this.config.positionStrategy.positionChanges
				.pipe(
					distinctUntilChanged(
						(a: ConnectedOverlayPositionChange, b: ConnectedOverlayPositionChange) =>
							a.connectionPair === b.connectionPair,
					),
					ngDocZoneOptimize(this.ngZone),
				)
				.subscribe((change: ConnectedOverlayPositionChange) => {
					this.currentPosition = NgDocOverlayUtils.getOverlayPosition(change.connectionPair);
					this.relativePosition = NgDocOverlayUtils.getRelativePosition(this.currentPosition);
					this.changeDetectorRef.markForCheck();
				});
		}
	}

	@HostBinding('attr.data-ng-doc-overlay-with-contact-border')
	get contactBorder(): boolean {
		return !!this.config?.contactBorder;
	}

	get isFocused(): boolean {
		return !!this.focusCatcher?.focused;
	}

	get animationEvent(): Observable<NgDocOverlayAnimationEvent> {
		return this.animationEvent$.asObservable();
	}

	get overlayAlign(): NgDocHorizontalAlign | NgDocVerticalAlign | null {
		return this.currentPosition
			? NgDocOverlayUtils.getPositionAlign(NgDocOverlayUtils.toConnectedPosition(this.currentPosition))
			: null;
	}

	close(): void {
		if (this.isOpened) {
			this.runAnimation(this.config?.closeAnimation || [], true);
			this.isOpened = false;
			this.changeDetectorRef.markForCheck();
		}
	}

	focus(): void {
		if (this.contentContainer) {
			NgDocFocusUtils.focusClosestElement(toElement(this.contentContainer), toElement(this.contentContainer));
		}
	}

	markForCheck(): void {
		this.changeDetectorRef.markForCheck();
	}

	private runAnimation(animation: AnimationMetadata[], close: boolean = false): void {
		const player: AnimationPlayer = this.animationBuilder.build(animation).create(this.elementRef.nativeElement);
		player.onStart(() => this.animationEvent$.next(close ? 'beforeClose' : 'beforeOpen'));
		player.onDone(() => this.animationEvent$.next(close ? 'afterClose' : 'afterOpen'));
		player.play();
	}

	ngOnDestroy(): void {
		if (this.isFocused && this.config && this.config.viewContainerRef) {
			NgDocFocusUtils.focusClosestElement(
				this.config.viewContainerRef.element.nativeElement,
				this.documentRef.body,
				false,
			);
		}
	}
}
