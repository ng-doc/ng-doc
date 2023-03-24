import {DOCUMENT} from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Directive,
	ElementRef,
	HostBinding,
	Inject,
	Input,
	NgZone,
	OnChanges,
	OnInit,
	SimpleChange,
	SimpleChanges,
	ViewChild,
} from '@angular/core';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit/observables';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, merge, Observable} from 'rxjs';
import {debounceTime, map, pairwise, switchMap, take, takeUntil, tap} from 'rxjs/operators';

@Directive({
	selector: '[ngDocPaneFront]',
})
export class NgDocPaneFrontDirective {}

@Directive({
	selector: '[ngDocPaneBack]',
})
export class NgDocPaneBackDirective {}

@Component({
	selector: 'ng-doc-pane',
	templateUrl: './pane.component.html',
	styleUrls: ['./pane.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocPaneComponent implements OnChanges, OnInit {
	@Input()
	expanded: boolean = false;

	@ViewChild('resizer', {static: true})
	resizer?: ElementRef<HTMLElement>;

	width: string = '0%';

	@HostBinding('attr.data-ng-doc-dragging')
	dragging: boolean = false;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly changeDetectorRef: ChangeDetectorRef,
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly ngZone: NgZone,
	) {}

	ngOnInit(): void {
		if (this.resizer) {
			const mouseDown$ = fromEvent(this.resizer.nativeElement, 'mousedown').pipe(
				tap(() => {
					this.dragging = true;
					this.changeDetectorRef.markForCheck();
				}),
			);

			const mouseUp$ = fromEvent(this.document, 'mouseup').pipe(
				tap(() => {
					this.dragging = false;
					this.changeDetectorRef.markForCheck();
				}),
			);

			const mouseMove$ = (fromEvent(this.document, 'mousemove') as Observable<MouseEvent>).pipe(
				map((event: MouseEvent) => event.clientX),
				pairwise(),
				map(([prev, next]: [number, number]) => next - prev),
			);

			mouseDown$
				.pipe(
					switchMap(() => {
						const dragEvent$ = mouseMove$.pipe(takeUntil(mouseUp$));

						const clickEvent$ = mouseUp$.pipe(
							map(() => null),
							takeUntil(mouseMove$),
							take(1),
						);

						return merge(dragEvent$, clickEvent$);
					}),
					untilDestroyed(this),
				)
				.subscribe((delta: number | null) => {
					delta === null ? this.toggle() : this.addDelta(delta);
				});
		}

		fromEvent(window, 'resize')
			.pipe(debounceTime(100), untilDestroyed(this), ngDocZoneOptimize(this.ngZone))
			.subscribe(() => this.addDelta(0));

		this.addDelta(0);
	}

	ngOnChanges({expanded}: SimpleChanges): void {
		if (expanded) {
			expanded.currentValue
				? this.addDelta(this.elementRef.nativeElement.offsetWidth)
				: this.addDelta(-this.elementRef.nativeElement.offsetWidth);
		}
	}

	toggle(): void {
		if (this.resizer) {
			const middle = this.elementRef.nativeElement.offsetWidth / 2;

			if (this.resizer.nativeElement.offsetLeft < middle) {
				this.addDelta(this.elementRef.nativeElement.offsetWidth);
			} else {
				this.addDelta(-this.elementRef.nativeElement.offsetWidth);
			}
		}
	}

	private addDelta(delta: number): void {
		if (this.resizer) {
			console.log('delta', delta);
			const maxWidth = this.elementRef.nativeElement.offsetWidth - this.resizer.nativeElement.offsetWidth;

			this.width = `${Math.min(maxWidth, Math.max(0, this.resizer.nativeElement.offsetLeft + delta))}px`;
			this.changeDetectorRef.detectChanges();
		}
	}
}
