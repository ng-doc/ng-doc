import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	Inject,
	OnInit,
	Optional,
	Renderer2,
	ViewChild,
} from '@angular/core';
import {ControlValueAccessor} from '@angular/forms';
import {NgDocPositionUtils} from '@ng-doc/ui-kit/utils';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {FL_CONTROL_HOST, FlCompareHost, FlControlHost, FlControlSelector} from 'flex-controls';
import {fromEvent} from 'rxjs';
import {filter, last, map, pairwise, startWith, switchMap, takeUntil, tap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-toggle',
	templateUrl: './toggle.component.html',
	styleUrls: ['./toggle.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocToggleComponent<T> extends FlControlSelector<T> implements OnInit, ControlValueAccessor {
	@ViewChild('wrapper', {static: true})
	private wrapper?: ElementRef<HTMLElement>;

	@ViewChild('circle', {static: true})
	private circle?: ElementRef<HTMLElement>;

	@HostBinding('attr.data-ng-doc-dragging')
	dragging: boolean = false;

	private maxPixelValue: number = 0;

	constructor(
		protected renderer: Renderer2,
		protected override changeDetectorRef: ChangeDetectorRef,
		@Inject(FlCompareHost)
		@Optional()
		protected override compareHost?: FlCompareHost<T | boolean | null>,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<T>,
	) {
		super(compareHost, host);
	}

	override ngOnInit(): void {
		super.ngOnInit();
		if (this.wrapper && this.circle) {
			this.maxPixelValue = this.wrapper.nativeElement.offsetWidth - this.circle.nativeElement.offsetWidth - 6;
			fromEvent(this.circle.nativeElement, 'mousedown')
				.pipe(
					filter(() => !this.disabled),
					switchMap(() => {
						const transition: string = this.circle?.nativeElement.style.transition ?? '';
						this.renderer.setStyle(this.circle?.nativeElement, 'transition', '');
						this.setDragging(true);

						return fromEvent(document.body, 'mousemove').pipe(
							pairwise(),
							map(
								([newEvent, oldEvent]: [Event, Event]) =>
									[newEvent, oldEvent] as [MouseEvent, MouseEvent],
							),
							map(
								([newEvent, oldEvent]: [MouseEvent, MouseEvent]) => oldEvent.clientX - newEvent.clientX,
							),
							filter((deltaX: number) => deltaX !== 0),
							tap((deltaX: number) => this.changeCirclePosition(deltaX)),
							startWith(null),
							takeUntil(fromEvent(document.body, 'mouseup').pipe(tap(() => this.setDragging(false)))),
							last(),
							tap(
								() =>
									this.circle &&
									this.renderer.setStyle(this.circle.nativeElement, 'transition', transition),
							),
						);
					}),
					untilDestroyed(this),
				)
				.subscribe((deltaX: number | null) => {
					deltaX === null ? this.toggle() : this.detectByCoordinates();
				});
		}
	}

	protected override incomingUpdate(value: T | null): void {
		super.incomingUpdate(value);
		this.setState(!!this.checked);
	}

	override updateModel(value: boolean | T | null): void {
		super.updateModel(value);
		this.setState(!!this.checked);
	}

	protected setState(isSelected: boolean): void {
		isSelected
			? this.circle &&
			  this.renderer.setStyle(this.circle.nativeElement, 'transform', `translateX(${this.maxPixelValue}px)`)
			: this.circle && this.renderer.setStyle(this.circle.nativeElement, 'transform', `translateX(0)`);
	}

	private setDragging(value: boolean): void {
		this.dragging = value;
		this.changeDetectorRef.markForCheck();
	}

	private detectByCoordinates(): void {
		if (!this.disabled && this.wrapper && this.circle) {
			const wrapperMiddle: number =
				NgDocPositionUtils.getElementPosition(this.wrapper.nativeElement).x +
				this.wrapper.nativeElement.offsetWidth / 2;
			const circleCenterLeft: number =
				NgDocPositionUtils.getElementPosition(this.circle.nativeElement).x +
				this.circle.nativeElement.offsetWidth / 2;
			circleCenterLeft > wrapperMiddle ? this.select() : this.deselect();
			this.setState(!!this.checked);
		}
	}

	private changeCirclePosition(delta: number): void {
		if (this.wrapper && this.circle) {
			const wrapperLeft: number = NgDocPositionUtils.getElementPosition(this.wrapper.nativeElement).x;
			const circleLeft: number = NgDocPositionUtils.getElementPosition(this.circle.nativeElement).x;
			const newPosition: number = Math.max(Math.min(circleLeft - wrapperLeft - 3 + delta, this.maxPixelValue), 0);
			this.renderer.setStyle(this.circle.nativeElement, 'transform', `translateX(${newPosition}px)`);
		}
	}
}
