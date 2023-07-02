import {NgFor} from '@angular/common';
import {
	AfterContentInit,
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ContentChildren,
	ElementRef,
	Input,
	QueryList,
	ViewChildren,
} from '@angular/core';
import {tabFadeAnimation} from '@ng-doc/ui-kit/animations';
import {
	NgDocSelectionComponent,
	NgDocSelectionHostDirective,
	NgDocSelectionOriginDirective,
} from '@ng-doc/ui-kit/components/selection';
import {NgDocSmoothResizeComponent} from '@ng-doc/ui-kit/components/smooth-resize';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';
import {startWith} from 'rxjs/operators';

import {NgDocTabComponent} from './tab/tab.component';

@Component({
	animations: [tabFadeAnimation],
	selector: 'ng-doc-tab-group',
	templateUrl: './tab-group.component.html',
	styleUrls: ['./tab-group.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocSelectionHostDirective,
		NgDocSelectionComponent,
		NgFor,
		NgDocSelectionOriginDirective,
		PolymorpheusModule,
		NgDocSmoothResizeComponent,
	],
})
@UntilDestroy()
export class NgDocTabGroupComponent<T = number> implements AfterContentInit, AfterViewInit {
	@Input()
	openedTab!: T;

	@ViewChildren('headerTab')
	tabElements: QueryList<ElementRef> = new QueryList<ElementRef>();

	@ContentChildren(NgDocTabComponent)
	tabs: QueryList<NgDocTabComponent<T>> = new QueryList<NgDocTabComponent<T>>();

	selectedTab?: NgDocTabComponent<T>;

	constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

	ngAfterContentInit(): void {
		this.tabs.changes.pipe(startWith(this.tabs), untilDestroyed(this)).subscribe(() => {
			const tabToOpen: NgDocTabComponent<T> | undefined = this.openedTab
				? this.tabs.find((tab: NgDocTabComponent<T>) => tab.id === this.openedTab)
				: this.tabs.get(0);

			tabToOpen && this.selectTab(tabToOpen);

			this.changeDetectorRef.markForCheck();
		});
	}

	ngAfterViewInit(): void {
		this.tabElements.changes
			.pipe(startWith(this.tabElements), untilDestroyed(this))
			.subscribe(() => this.changeDetectorRef.detectChanges());
	}

	get selectedIndex(): number {
		return this.selectedTab ? this.tabs.toArray().indexOf(this.selectedTab) : -1;
	}

	get selectedHeaderTab(): ElementRef | null {
		return this.selectedTab ? this.tabElements.get(this.selectedIndex) ?? null : null;
	}

	selectTab(tab: NgDocTabComponent<T>) {
		this.selectedTab = tab;
	}
}
