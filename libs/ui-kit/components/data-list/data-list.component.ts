import {ChangeDetectionStrategy, Component, Input, TrackByFunction} from '@angular/core';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NG_DOC_ALWAYS_FALSE_HANDLER, NG_DOC_DEFAULT_HANDLER, NG_DOC_DEFAULT_STRINGIFY} from '@ng-doc/ui-kit/constants';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {NgDocContextWithImplicit} from '@ng-doc/ui-kit/interfaces';
import {NgDocBooleanHandler, NgDocContent, NgDocDefineValueFunction} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-data-list',
	templateUrl: './data-list.component.html',
	styleUrls: ['./data-list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDataListComponent<T> {
	@Input()
	autofocus: boolean = true;

	@Input()
	items: readonly T[] | null = [];

	@Input()
	itemContent: NgDocContent<NgDocContextWithImplicit<T>> = ({$implicit}: NgDocContextWithImplicit<T>) =>
		NG_DOC_DEFAULT_STRINGIFY($implicit);

	@Input()
	emptyContent: NgDocContent = '';

	@Input()
	itemDisabledFn: NgDocBooleanHandler<T> = NG_DOC_ALWAYS_FALSE_HANDLER;

	@Input()
	defineValueFn: NgDocDefineValueFunction<unknown, unknown> = NG_DOC_DEFAULT_HANDLER;

	@Input()
	trackByFn: TrackByFunction<T> = (_index: number, item: T) => item;

	@ngDocMakePure
	getContext($implicit: T): NgDocContextWithImplicit<T> {
		return {$implicit};
	}

	getItems(): T[] {
		return asArray(this.items);
	}
}
