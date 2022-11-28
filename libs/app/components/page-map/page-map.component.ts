import {DOCUMENT} from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	Inject,
	Input,
	NgZone,
	OnChanges,
	QueryList,
	Renderer2,
	ViewChild,
	ViewChildren,
} from '@angular/core';
import {generatePageMap} from '@ng-doc/app/helpers';
import {NgDocPageMapItem} from '@ng-doc/app/interfaces';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent} from 'rxjs';
import {distinctUntilChanged, map, startWith} from 'rxjs/operators';

import {NgDocPageMapElementComponent} from './page-map-element/page-map-element.component';

@Component({
	selector: 'ng-doc-page-map',
	templateUrl: './page-map.component.html',
	styleUrls: ['./page-map.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocPageMapComponent implements OnChanges, AfterViewInit {
	@Input()
	pageContainer?: HTMLElement;

	@ViewChild('selection', {static: true, read: ElementRef})
	selection?: ElementRef<HTMLElement>;

	@ViewChildren(NgDocPageMapElementComponent)
	elements: QueryList<NgDocPageMapElementComponent> = new QueryList<NgDocPageMapElementComponent>();

	map: NgDocPageMapItem[] = [];
	activeItem?: NgDocPageMapItem;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly ngZone: NgZone,
		private readonly changeDetectorRef: ChangeDetectorRef,
		private readonly renderer: Renderer2,
	) {}

	ngOnChanges(): void {
		if (this.pageContainer) {
			this.map = generatePageMap(this.pageContainer);
		}
	}

	ngAfterViewInit(): void {
		fromEvent(this.document, 'scroll')
			.pipe(
				map((event: Event) => (event.target as Document).scrollingElement as HTMLElement),
				startWith(this.document.scrollingElement as HTMLElement),
				map((target: HTMLElement) => {
					const percentage: number = target.scrollTop * 100 / (target.scrollHeight - target.offsetHeight);
					const selectionLine: number = target.scrollTop + target.offsetHeight * percentage / 100;

					return this.map.reduce((pTarget: NgDocPageMapItem, cTarget: NgDocPageMapItem) => {
						const pTop: number = pTarget.element.getBoundingClientRect().top + target.scrollTop;
						const cTop: number = cTarget.element.getBoundingClientRect().top + target.scrollTop;

						return (Math.abs(cTop - selectionLine) < Math.abs(pTop - selectionLine) ? cTarget : pTarget);
					});
				}),
				distinctUntilChanged(),
				ngDocZoneOptimize(this.ngZone),
				untilDestroyed(this)
			)
			.subscribe(this.select.bind(this));
	}

	private select(item: NgDocPageMapItem): void {
		const index: number = this.map.indexOf(item);

		if (this.selection) {
			const element: HTMLElement | undefined = this.elements.toArray()[index]?.elementRef.nativeElement;

			if (element) {
				const top: number = element.offsetTop + element.offsetHeight / 2 - 4;

				this.renderer.setStyle(this.selection.nativeElement, 'top', `${top}px`);
			}
		}

		this.activeItem = item;
		this.changeDetectorRef.detectChanges();
	}
}
