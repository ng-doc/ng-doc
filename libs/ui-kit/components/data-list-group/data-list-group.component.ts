import {ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import {NgDocDataListComponent} from '@ng-doc/ui-kit/components/data-list';
import {NG_DOC_DEFAULT_STRINGIFY} from '@ng-doc/ui-kit/constants';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {NgDocContextWithImplicit} from '@ng-doc/ui-kit/interfaces';
import {NgDocContent, NgDocGroupFn} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-data-list-group',
	templateUrl: './data-list-group.component.html',
	styleUrls: ['./data-list-group.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDataListGroupComponent<T, G> extends NgDocDataListComponent<T> implements OnChanges {
	@Input()
	itemGroupFn?: NgDocGroupFn<T, G>;

	@Input()
	groupContent: NgDocContent<NgDocContextWithImplicit<G>> = ({$implicit}: NgDocContextWithImplicit<G>) =>
		NG_DOC_DEFAULT_STRINGIFY($implicit);

	groups: Map<G, T[]> = new Map();

	groupItems: G[] = [];

	@ngDocMakePure
	getGroupContext($implicit: G): NgDocContextWithImplicit<G> {
		return {$implicit};
	}

	ngOnChanges({items, itemGroupFn}: SimpleChanges): void {
		if (items || itemGroupFn) {
			this.groups = new Map<G, T[]>();

			this.items?.forEach((item: T) => {
				if (this.itemGroupFn) {
					const itemGroup: G = this.itemGroupFn(item);
					const itemsList: T[] = this.groups.get(itemGroup) || [];
					itemsList.push(item);

					this.groups.set(this.itemGroupFn(item), itemsList);
				}
			});

			this.groupItems = Array.from(this.groups.keys());
		}
	}
}
