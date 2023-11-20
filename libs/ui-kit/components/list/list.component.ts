import { ListKeyManager } from '@angular/cdk/a11y';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	Inject,
	NgZone,
	Optional,
} from '@angular/core';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocListHost } from '@ng-doc/ui-kit/classes/list-host';
import { NgDocListItem } from '@ng-doc/ui-kit/classes/list-item';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromEvent, merge, NEVER } from 'rxjs';
import { delayWhen, filter, repeat, takeUntil } from 'rxjs/operators';

@Component({
	selector: 'ng-doc-list',
	templateUrl: './list.component.html',
	styleUrls: ['./list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
@UntilDestroy()
export class NgDocListComponent {
	private keyManager: ListKeyManager<NgDocListItem> | null = null;
	private readonly items: Set<NgDocListItem> = new Set<NgDocListItem>();

	constructor(
		private elementRef: ElementRef<HTMLElement>,
		private ngZone: NgZone,
		@Inject(NgDocListHost) @Optional() private listHost?: NgDocListHost,
	) {
		const origin: HTMLElement | null = this.listHost?.listHostOrigin
			? toElement(this.listHost?.listHostOrigin)
			: null;
		const list: HTMLElement = toElement(this.elementRef);

		merge(
			fromEvent(list, 'keydown'),
			origin
				? fromEvent(origin, 'keydown').pipe(
						takeUntil(fromEvent(list, 'keydown')),
						delayWhen(() => this.ngZone.onStable),
						repeat(),
				  )
				: NEVER,
		)
			.pipe(
				filter((event: Event) => !event.defaultPrevented),
				untilDestroyed(this),
			)
			.subscribe((event: Event) => {
				const typedEvent: KeyboardEvent = event as KeyboardEvent;

				switch (typedEvent.key) {
					case 'Enter':
						this.keyManager?.activeItem?.selectByUser();

						typedEvent.preventDefault();
						break;
				}

				this.keyManager?.activeItem?.setInactiveStyles();
				this.keyManager?.onKeydown(typedEvent);
				this.keyManager?.activeItem?.setActiveStyles();

				if (this.keyManager?.activeItem)
					toElement(this.keyManager?.activeItem.elementRef).scrollIntoView({ block: 'nearest' });
			});
	}

	registerItem(item: NgDocListItem): void {
		this.items.add(item);

		this.keyManager?.activeItem?.setInactiveStyles();
		this.keyManager = new ListKeyManager(asArray(this.items)).withVerticalOrientation(true);
	}

	unregisterItem(item: NgDocListItem): void {
		this.items.delete(item);
	}
}
