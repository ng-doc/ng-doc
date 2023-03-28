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
import {Event as REvent, Router, Scroll} from '@angular/router';
import {generateToc} from '@ng-doc/app/helpers';
import {NgDocTocItem} from '@ng-doc/app/interfaces';
import {isPresent} from '@ng-doc/core/helpers/is-present';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {UntilDestroy} from '@ngneat/until-destroy';
import {fromEvent, merge, Observable} from 'rxjs';
import {debounceTime, distinctUntilChanged, filter, map, startWith} from 'rxjs/operators';

import {NgDocTocElementComponent} from './toc-element/toc-element.component';

@Component({
	selector: 'ng-doc-toc',
	templateUrl: './toc.component.html',
	styleUrls: ['./toc.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocTocComponent implements OnChanges, AfterViewInit {
	@Input()
	pageContainer?: HTMLElement;

	@ViewChild('selection', {static: true, read: ElementRef})
	selection?: ElementRef<HTMLElement>;

	@ViewChildren(NgDocTocElementComponent)
	elements: QueryList<NgDocTocElementComponent> = new QueryList<NgDocTocElementComponent>();

	map: NgDocTocItem[] = [];
	activeItem?: NgDocTocItem;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly ngZone: NgZone,
		private readonly changeDetectorRef: ChangeDetectorRef,
		private readonly renderer: Renderer2,
		private readonly router: Router,
	) {}

	ngOnChanges(): void {
		/**
		 * We need to use `Promise.resolve().then()` here because we need to wait for the `pageContainer` to be rendered
		 * and processed by the processors
		 */
		Promise.resolve().then(() => {
			if (this.pageContainer) {
				this.map = generateToc(this.pageContainer);
				this.changeDetectorRef.detectChanges();
			}
		});
	}

	ngAfterViewInit(): void {
		const scrollSelection: Observable<NgDocTocItem> = fromEvent(this.document, 'scroll').pipe(
			map((event: Event) => (event.target as Document).scrollingElement as HTMLElement),
			startWith(this.document.scrollingElement as HTMLElement),
			filter(() => !!this.map.length),
			map((target: HTMLElement) => {
				const percentage: number = (target.scrollTop * 100) / (target.scrollHeight - target.offsetHeight);
				const selectionLine: number = target.scrollTop + (target.offsetHeight * percentage) / 100;

				return this.map.reduce((pTarget: NgDocTocItem, cTarget: NgDocTocItem) => {
					const pTop: number = pTarget.element.getBoundingClientRect().top + target.scrollTop;
					const cTop: number = cTarget.element.getBoundingClientRect().top + target.scrollTop;

					return Math.abs(cTop - selectionLine) < Math.abs(pTop - selectionLine) ? cTarget : pTarget;
				});
			}),
		);
		const routerSelection: Observable<NgDocTocItem> = this.router.events.pipe(
			map((event: REvent) => {
				if (event instanceof Scroll) {
					const item: NgDocTocItem | undefined = this.map.find((item: NgDocTocItem) =>
						item.path.includes(event.routerEvent.url),
					);

					if (item) {
						return item;
					}
				}

				return null;
			}),
			filter(isPresent),
			debounceTime(20),
		);

		Promise.resolve().then(() => {
			merge(scrollSelection, routerSelection)
				.pipe(distinctUntilChanged(), ngDocZoneOptimize(this.ngZone))
				.subscribe(this.select.bind(this));
		});
	}

	private select(item: NgDocTocItem): void {
		const index: number = this.map.indexOf(item);

		if (this.selection) {
			const element: HTMLElement | undefined = this.elements.toArray()[index]?.elementRef.nativeElement;

			if (element) {
				this.renderer.setStyle(this.selection.nativeElement, 'top', `${element.offsetTop}px`);
				this.renderer.setStyle(this.selection.nativeElement, 'height', `${element.offsetHeight}px`);

				element.scrollIntoView({block: 'nearest'});
			}
		}

		this.activeItem = item;
		this.changeDetectorRef.detectChanges();
	}
}
