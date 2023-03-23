import {DOCUMENT} from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Directive,
	ElementRef,
	HostBinding,
	Inject,
	OnInit,
	ViewChild,
} from '@angular/core';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, merge, Observable} from 'rxjs';
import {map, pairwise, switchMap, take, takeUntil, tap} from 'rxjs/operators';

@Directive({
	selector: '[ngDocScreenFace]',
})
export class NgDocScreenFaceDirective {}

@Directive({
	selector: '[ngDocScreenBack]',
})
export class NgDocScreenBackDirective {}

@Component({
	selector: 'ng-doc-screen',
	templateUrl: './screen.component.html',
	styleUrls: ['./screen.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocScreenComponent implements OnInit {
	@ViewChild('resizer', {static: true})
	resizer?: ElementRef<HTMLElement>;

	width: string = '100%';

	@HostBinding('attr.data-ng-doc-dragging')
	dragging: boolean = false;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly changeDetectorRef: ChangeDetectorRef,
		private readonly elementRef: ElementRef<HTMLElement>,
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

			const mouseMove$ = fromEvent(this.document, 'mousemove') as Observable<MouseEvent>;

			mouseDown$
				.pipe(
					switchMap(() => {
						const dragEvent$ = mouseMove$.pipe(
							map((event: MouseEvent) => event.clientX),
							pairwise(),
							map(([prev, next]: [number, number]) => next - prev),
							takeUntil(mouseUp$),
						);
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

		this.addDelta(0);
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
