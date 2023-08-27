import { DOCUMENT, NgFor } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	inject,
	Input,
	NgZone,
	QueryList,
	Renderer2,
	ViewChild,
	ViewChildren,
} from '@angular/core';
import { Event as REvent, Router, Scroll } from '@angular/router';
import { NgDocPageToc, NgDocTocItem } from '@ng-doc/app/interfaces';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { NgDocMediaQueryDirective, ngDocZoneOptimize } from '@ng-doc/ui-kit';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromEvent, merge, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';

import { NgDocTocElementComponent } from './toc-element/toc-element.component';

@Component({
	selector: 'ng-doc-toc',
	templateUrl: './toc.component.html',
	styleUrls: ['./toc.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgFor, NgDocTocElementComponent, NgDocMediaQueryDirective],
})
@UntilDestroy()
export class NgDocTocComponent implements AfterViewInit, NgDocPageToc {
	@Input()
	tableOfContent: NgDocTocItem[] = [];

	@ViewChild('selection', { read: ElementRef })
	selection?: ElementRef<HTMLElement>;

	@ViewChildren(NgDocTocElementComponent)
	elements: QueryList<NgDocTocElementComponent> = new QueryList<NgDocTocElementComponent>();

	activeItem?: NgDocTocItem;

	protected readonly document: Document = inject(DOCUMENT);
	protected readonly ngZone: NgZone = inject(NgZone);
	protected readonly changeDetectorRef: ChangeDetectorRef = inject(ChangeDetectorRef);
	protected readonly renderer: Renderer2 = inject(Renderer2);
	protected readonly router: Router = inject(Router);

	ngAfterViewInit(): void {
		const scrollSelection: Observable<NgDocTocItem> = fromEvent(this.document, 'scroll').pipe(
			filter(() => !!this.tableOfContent.length),
			map((event: Event) => (event.target as Document).scrollingElement as HTMLElement),
			startWith(this.document.scrollingElement as HTMLElement),
			map((target: HTMLElement) => {
				const percentage: number =
					(target.scrollTop * 100) / (target.scrollHeight - target.offsetHeight);
				const selectionLine: number = target.scrollTop + (target.offsetHeight * percentage) / 100;

				return this.tableOfContent.reduce((pTarget: NgDocTocItem, cTarget: NgDocTocItem) => {
					const pTop: number = pTarget.element.getBoundingClientRect().top + target.scrollTop;
					const cTop: number = cTarget.element.getBoundingClientRect().top + target.scrollTop;

					return Math.abs(cTop - selectionLine) < Math.abs(pTop - selectionLine)
						? cTarget
						: pTarget;
				});
			}),
		);

		const routerSelection: Observable<NgDocTocItem> = this.router.events.pipe(
			map((event: REvent) => {
				if (event instanceof Scroll) {
					const item: NgDocTocItem | undefined = this.tableOfContent.find((item: NgDocTocItem) =>
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

		const elementsChanges = this.elements.changes.pipe(
			map(() => this.activeItem),
			filter(isPresent),
		);

		merge(merge(scrollSelection, routerSelection).pipe(distinctUntilChanged()), elementsChanges)
			.pipe(ngDocZoneOptimize(this.ngZone), untilDestroyed(this))
			.subscribe(this.select.bind(this));
	}

	/**
	 * Selects the item in the table of content.
	 *
	 * @param item - Item to select.
	 */
	protected select(item: NgDocTocItem): void {
		const index: number = this.tableOfContent.indexOf(item);

		if (this.selection) {
			const element: HTMLElement | undefined =
				this.elements.toArray()[index]?.elementRef.nativeElement;

			if (element) {
				this.renderer.setStyle(this.selection.nativeElement, 'top', `${element.offsetTop}px`);
				this.renderer.setStyle(this.selection.nativeElement, 'height', `${element.offsetHeight}px`);

				element.scrollIntoView({ block: 'nearest' });
			}
		}

		this.activeItem = item;
		this.changeDetectorRef.detectChanges();
	}
}
