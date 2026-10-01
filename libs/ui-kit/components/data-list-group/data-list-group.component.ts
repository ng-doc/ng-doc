import { ChangeDetectionStrategy, Component, computed, input, Signal } from '@angular/core';
import { NgDocDataListComponent } from '@ng-doc/ui-kit/components/data-list';
import { NgDocListComponent } from '@ng-doc/ui-kit/components/list';
import { NgDocOptionComponent } from '@ng-doc/ui-kit/components/option';
import {
  NgDocOptionGroupComponent,
  NgDocOptionGroupHeaderDirective,
} from '@ng-doc/ui-kit/components/option-group';
import { NgDocTextComponent } from '@ng-doc/ui-kit/components/text';
import { NG_DOC_DEFAULT_STRINGIFY } from '@ng-doc/ui-kit/constants';
import { NgDocContextWithImplicit } from '@ng-doc/ui-kit/interfaces';
import { NgDocContent, NgDocGroupFn } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/**
 * Data list whose options are grouped by `itemGroupFn`, with a header per group.
 */
@Component({
  selector: 'ng-doc-data-list-group',
  templateUrl: './data-list-group.component.html',
  styleUrls: ['./data-list-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocListComponent,
    NgDocOptionGroupComponent,
    PolymorpheusOutlet,
    NgDocOptionGroupHeaderDirective,
    NgDocOptionComponent,
    NgDocTextComponent,
  ],
})
export class NgDocDataListGroupComponent<T, G> extends NgDocDataListComponent<T> {
  /** Returns the group of an item. Without it, no option is shown. */
  readonly itemGroupFn = input<NgDocGroupFn<T, G>>();

  /** Content of a group header; its context is the group. */
  readonly groupContent = input<NgDocContent<NgDocContextWithImplicit<G>>>(
    ({ $implicit }: NgDocContextWithImplicit<G>) => NG_DOC_DEFAULT_STRINGIFY($implicit),
  );

  /** Items by group, in the order in which the groups first appear. */
  readonly groups: Signal<Map<G, T[]>> = computed(() => {
    const itemGroupFn: NgDocGroupFn<T, G> | undefined = this.itemGroupFn();
    const groups: Map<G, T[]> = new Map<G, T[]>();

    if (itemGroupFn) {
      this.items()?.forEach((item: T) => {
        const itemGroup: G = itemGroupFn(item);
        const groupItems: T[] | undefined = groups.get(itemGroup);

        if (groupItems) {
          groupItems.push(item);
        } else {
          groups.set(itemGroup, [item]);
        }
      });
    }

    return groups;
  });

  /** The groups, in the order in which they first appear. */
  readonly groupItems: Signal<G[]> = computed(() => Array.from(this.groups().keys()));
}
