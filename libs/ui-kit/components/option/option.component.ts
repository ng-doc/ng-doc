import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostBinding,
	HostListener,
	inject,
	OnDestroy,
} from '@angular/core';
import { NgDocListItem } from '@ng-doc/ui-kit/classes/list-item';
import { NgDocListComponent } from '@ng-doc/ui-kit/components/list';
import { DICompareHost, DIStateControl, injectHostControl } from 'di-controls';

@Component({
	selector: 'ng-doc-option',
	template: '<ng-content></ng-content>',
	styleUrls: ['./option.component.scss'],
	providers: [
		{
			provide: NgDocListItem,
			useExisting: NgDocOptionComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocOptionComponent<T> extends DIStateControl<T> implements NgDocListItem, OnDestroy {
	@HostBinding('attr.data-ng-doc-hover')
	protected hovered: boolean = false;

	override readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
	protected readonly list: NgDocListComponent | null = inject(NgDocListComponent, {
		optional: true,
	});

	constructor() {
		super({
			host: injectHostControl({ optional: true }),
			compareHost: inject(DICompareHost, { optional: true }),
		});

		this.list?.registerItem(this);
	}

	@HostListener('click')
	clickEvent(): void {
		this.check();
	}

	selectByUser(): void {
		const anchor: HTMLAnchorElement | null = this.elementRef.nativeElement.querySelector('a');

		anchor ? anchor.click() : this.check();
	}

	setActiveStyles(): void {
		this.hovered = true;
		this.changeDetectorRef.markForCheck();
	}

	setInactiveStyles(): void {
		this.hovered = false;
		this.changeDetectorRef.markForCheck();
	}

	ngOnDestroy(): void {
		this.list?.unregisterItem(this);
	}
}
