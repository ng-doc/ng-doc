import { ChangeDetectionStrategy, Component, input, TrackByFunction } from '@angular/core';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocListComponent } from '@ng-doc/ui-kit/components/list';
import { NgDocOptionComponent } from '@ng-doc/ui-kit/components/option';
import { NgDocTextComponent } from '@ng-doc/ui-kit/components/text';
import {
  NG_DOC_ALWAYS_FALSE_HANDLER,
  NG_DOC_DEFAULT_HANDLER,
  NG_DOC_DEFAULT_STRINGIFY,
} from '@ng-doc/ui-kit/constants';
import { NgDocContextWithImplicit } from '@ng-doc/ui-kit/interfaces';
import { NgDocBooleanHandler, NgDocContent, NgDocDefineValueFunction } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/**
 * Keyboard-navigable list of options built from `items`.
 */
@Component({
  selector: 'ng-doc-data-list',
  templateUrl: './data-list.component.html',
  styleUrls: ['./data-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocListComponent, NgDocOptionComponent, PolymorpheusOutlet, NgDocTextComponent],
})
export class NgDocDataListComponent<T> {
  /** Whether the list takes focus when it opens. */
  readonly autofocus = input<boolean>(true);

  /** Items to show. */
  readonly items = input<readonly T[] | null>([]);

  /** Content of an option; its context is the item. */
  readonly itemContent = input<NgDocContent<NgDocContextWithImplicit<T>>>(
    ({ $implicit }: NgDocContextWithImplicit<T>) => NG_DOC_DEFAULT_STRINGIFY($implicit),
  );

  /** Content shown when there are no items. */
  readonly emptyContent = input<NgDocContent>('');

  /** Returns `true` for items whose option is disabled. */
  readonly itemDisabledFn = input<NgDocBooleanHandler<T>>(NG_DOC_ALWAYS_FALSE_HANDLER);

  /** Maps an item to the value its option selects. */
  readonly defineValueFn =
    input<NgDocDefineValueFunction<unknown, unknown>>(NG_DOC_DEFAULT_HANDLER);

  /** Identifies items across changes of `items`. */
  readonly trackByFn = input<TrackByFunction<T>>((_index: number, item: T) => item);

  /** Returns the items as an array. */
  getItems(): T[] {
    return asArray(this.items());
  }
}
