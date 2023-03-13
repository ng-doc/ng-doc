import {Point} from '@angular/cdk/drag-drop';
import {CdkOverlayOrigin, FlexibleConnectedPositionStrategy, PositionStrategy} from '@angular/cdk/overlay';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	EventEmitter,
	HostBinding,
	HostListener,
	Inject,
	Input,
	NgZone,
	OnChanges,
	OnDestroy,
	Optional,
	Output,
	SimpleChanges,
	ViewContainerRef,
} from '@angular/core';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {dropdownOpenAnimation} from '@ng-doc/ui-kit/animations';
import {NgDocOverlayHost} from '@ng-doc/ui-kit/classes/overlay-host';
import {NgDocOverlayRef} from '@ng-doc/ui-kit/classes/overlay-ref';
import {NgDocOverlayContainerComponent} from '@ng-doc/ui-kit/components/overlay-container';
import {mergeOverlayConfigs, toElement} from '@ng-doc/ui-kit/helpers';
import {NgDocOverlayConfig, NgDocOverlayProperties} from '@ng-doc/ui-kit/interfaces';
import {ngDocZoneDetach} from '@ng-doc/ui-kit/observables';
import {NgDocOverlayService} from '@ng-doc/ui-kit/services/overlay';
import {NgDocOverlayStrategy} from '@ng-doc/ui-kit/services/overlay-strategy';
import {NgDocContent, NgDocOverlayOrigin, NgDocOverlayPosition} from '@ng-doc/ui-kit/types';
import {NgDocOverlayUtils} from '@ng-doc/ui-kit/utils';
import {UntilDestroy} from '@ngneat/until-destroy';

@Component({
	selector: 'ng-doc-dropdown',
	template: ``,
	styleUrls: ['./dropdown.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [NgDocOverlayService],
})
@UntilDestroy()
export class NgDocDropdownComponent implements OnChanges, OnDestroy {
	@Input()
	content: NgDocContent = '';

	@Input()
	origin: CdkOverlayOrigin | Point | null = null;

	@Input()
	closeIfOutsideClick: boolean = true;

	@Input()
	closeIfInnerClick: boolean = false;

	@Input()
	withArrow: boolean = false;

	@Input()
	borderOffset: number = -8;

	@Input()
	panelClass: string | string[] = [];

	@Input()
	contactBorder: boolean = true;

	@Input()
	positions: NgDocOverlayPosition | NgDocOverlayPosition[] = [
		'bottom-center',
		'top-center',
		'right-center',
		'left-center',
	];

	@Input()
	minHeight: number | string = '';

	@Input()
	maxHeight: number | string = '';

	@Input()
	height: number | string = '';

	@Input()
	minWidth: number | string = '';

	@Input()
	maxWidth: number | string = '';

	@Input()
	width: number | string = '';

	@Output()
	beforeOpen: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	afterOpen: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	beforeClose: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	afterClose: EventEmitter<void> = new EventEmitter<void>();

	overlay: NgDocOverlayRef | null = null;
	overlayProperties: NgDocOverlayProperties = this.getOverlayProperties();

	constructor(
		protected changeDetectorRef: ChangeDetectorRef,
		protected overlayService: NgDocOverlayService,
		protected viewContainerRef: ViewContainerRef,
		protected overlayScrollStrategy: NgDocOverlayStrategy,
		protected ngZone: NgZone,
		@Inject(NgDocOverlayHost)
		@Optional()
		protected overlayHost?: NgDocOverlayHost,
	) {}

	ngOnChanges({origin}: SimpleChanges): void {
		if (origin && origin.currentValue !== origin.previousValue) {
			if (!origin.currentValue) {
				this.origin = origin.previousValue as CdkOverlayOrigin | Point | null;
			}

			if (this.overlay) {
				const positionStrategy: PositionStrategy | undefined =
					this.overlay.overlayRef.getConfig().positionStrategy;
				if (positionStrategy instanceof FlexibleConnectedPositionStrategy && this.currentOrigin) {
					this.overlay.overlayRef.updatePositionStrategy(positionStrategy.setOrigin(this.currentOrigin));
				}
			}
		}
		this.updateOverlayPosition();
	}

	@HostBinding('attr.tabIndex')
	get tabIndex(): number {
		return this.isOpened ? 0 : -1;
	}

	@HostListener('focus')
	focus(): void {
		this.overlay?.focus();
	}

	get isFocused(): boolean {
		return !!this.overlay?.isFocused;
	}

	open(): void {
		if (!this.overlay?.hasAttached) {
			const config: NgDocOverlayConfig = this.getConfig();
			this.overlay = this.overlayService.open(this.content, config);
			this.beforeOpen.emit();
			this.overlay
				?.afterOpen()
				.pipe(ngDocZoneDetach(this.ngZone))
				.subscribe(() => this.afterOpen.emit());

			this.overlay
				?.beforeClose()
				.pipe(ngDocZoneDetach(this.ngZone))
				.subscribe(() => this.beforeClose.emit());

			this.overlay
				?.afterClose()
				.pipe(ngDocZoneDetach(this.ngZone))
				.subscribe(() => this.afterClose.emit());

			this.overlay.beforeClose().subscribe(() => this.close());

			this.changeDetectorRef.markForCheck();
		}
	}

	close(): void {
		if (this.isOpened) {
			this.overlay?.close();
			this.changeDetectorRef.markForCheck();
		}
	}

	toggle(): void {
		this.isOpened ? this.close() : this.open();
	}

	get isOpened(): boolean {
		return this.overlay?.isOpened === true;
	}

	updateOverlayPosition(): void {
		if (this.overlay && this.overlay.hasAttached) {
			this.overlay.overlayRef.updateSize(this.getConfig());
			this.overlay.overlayRef.updatePosition();
		}
	}

	private get currentOrigin(): NgDocOverlayOrigin | null {
		return this.origin instanceof CdkOverlayOrigin
			? (this.origin.elementRef.nativeElement as HTMLElement)
			: this.origin || this.overlayHost?.origin || null;
	}

	private getPositions(
		positions: NgDocOverlayPosition | NgDocOverlayPosition[],
		border: number,
	): NgDocOverlayPosition[] {
		const origin: NgDocOverlayOrigin = toElement(this.currentOrigin) as HTMLElement;
		if (origin instanceof HTMLElement) {
			return NgDocOverlayUtils.getConnectedPosition(
				!!positions && asArray(positions).length
					? positions
					: ['bottom-center', 'top-center', 'right-center', 'left-center'],
				origin,
				border * -1,
				this.withArrow,
			);
		} else {
			return !!positions && asArray(positions).length
				? asArray(positions)
				: ['bottom-center', 'top-center', 'right-center', 'left-center'];
		}
	}

	private getConfig(): NgDocOverlayConfig {
		const overlayProperties: NgDocOverlayProperties = mergeOverlayConfigs(
			this.overlayProperties,
			this.getOverlayProperties(),
			this.overlayHost,
		);
		if (!this.currentOrigin) {
			throw new Error('Origin for the dropdown was not provided.');
		}
		return {
			overlayContainer: NgDocOverlayContainerComponent,
			positionStrategy: this.overlayService.connectedPositionStrategy(
				this.currentOrigin,
				this.getPositions(overlayProperties.positions || [], overlayProperties.borderOffset || 0),
			),
			scrollStrategy: this.overlayScrollStrategy,
			viewContainerRef: this.viewContainerRef,
			openAnimation: dropdownOpenAnimation,
			...overlayProperties,
			panelClass: ['ng-doc-dropdown', ...asArray(this.panelClass), ...asArray(this.overlayHost?.panelClass)],
		};
	}

	private getOverlayProperties(): NgDocOverlayProperties {
		return {
			origin: this.currentOrigin || undefined,
			positions: this.positions,
			closeIfOutsideClick: this.closeIfOutsideClick,
			closeIfInnerClick: this.closeIfInnerClick,
			withPointer: this.withArrow,
			contactBorder: this.contactBorder,
			borderOffset: this.borderOffset,
			panelClass: this.panelClass,
			width: this.width,
			height: this.height,
			minWidth: this.minWidth,
			minHeight: this.minHeight,
			maxWidth: this.maxWidth,
			maxHeight: this.maxHeight,
			disposeOnNavigation: true,
			disposeOnRouteNavigation: true,
		};
	}

	ngOnDestroy(): void {
		if (this.overlay) {
			this.overlay.overlayRef.dispose();
		}
	}
}
