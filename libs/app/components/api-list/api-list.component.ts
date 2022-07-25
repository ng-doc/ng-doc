import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {FormBuilder, FormGroup} from '@angular/forms';
import {NG_DOC_API_LIST_TOKEN} from '@ng-doc/app/tokens';
import {NgDocTypedForm} from '@ng-doc/app/types';
import {NgDocApiList, NgDocApiListItem} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Observable} from 'rxjs';
import {debounceTime, map, startWith} from 'rxjs/operators';

interface ApiFilterForm {
	filter: string | null;
	type: string | null;
}

/**
 * Decorator that binds a DOM event to a host listener and supplies configuration metadata.
 * Angular invokes the supplied handler method when the host element emits the specified event,
 * and updates the bound element with the result.
 *
 * If the handler method returns false, applies `preventDefault` on the bound element.
 *
 * The following example declares a directive
 * that attaches a click listener to a button and counts clicks.
 *
 * ```typescript
 * @Directive({selector: 'button[counting]'})
 * class CountClicks {
 *   numberOfClicks = 0;
 *
 *   @HostListener('click', ['$event.target'])
 *   onClick(btn) {
 *     console.log('button', btn, 'number of clicks:', this.numberOfClicks++);
 *   }
 * }
 *
 * @Component({
 *   selector: 'app',
 *   template: '<button counting>Increment</button>',
 * })
 * class App {}
 *
 * ```
 *
 * The following example registers another DOM event handler that listens for `Enter` key-press
 * events on the global `window`.
 * ```typescript
 * import { HostListener, Component } from "@angular/core";
 *
 * @Component({
 *   selector: 'app',
 *   template: `<h1>Hello, you have pressed enter {{counter}} number of times!</h1> Press enter key
 * to increment the counter.
 *   <button (click)="resetCounter()">Reset Counter</button>`
 * })
 * class AppComponent {
 *   counter = 0;
 *   @HostListener('window:keydown.enter', ['$event'])
 *   handleKeyDown(event: KeyboardEvent) {
 *     this.counter++;
 *   }
 *   resetCounter() {
 *     this.counter = 0;
 *   }
 * }
 * ```
 * The list of valid key names for `keydown` and `keyup` events
 * can be found here:
 * https://www.w3.org/TR/DOM-Level-3-Events-key/#named-key-attribute-values
 *
 * Note that keys can also be combined, e.g. `@HostListener('keydown.shift.a')`.
 *
 * The global target names that can be used to prefix an event name are
 * `document:`, `window:` and `body:`.
 *
 */
@Component({
	selector: 'ng-doc-api-list',
	templateUrl: './api-list.component.html',
	styleUrls: ['./api-list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocApiListComponent {
	formGroup: FormGroup<NgDocTypedForm<ApiFilterForm>>;
	api$: Observable<NgDocApiList[]>;

	constructor(
		@Inject(NG_DOC_API_LIST_TOKEN)
		private readonly apiList: NgDocApiList[],
		private readonly formBuilder: FormBuilder,
	) {
		console.log('apiList', apiList);

		this.formGroup = this.formBuilder.group({
			filter: [''],
			type: [''],
		});

		this.api$ = this.formGroup.valueChanges.pipe(
			debounceTime(200),
			startWith(null),
			map(() => this.formGroup.value),
			map((form: Partial<ApiFilterForm>) =>
				this.apiList
					.map((api: NgDocApiList) => ({
						...api,
						items: api.items
							.filter(
								(item: NgDocApiListItem) =>
									item.name.toLowerCase().includes(form?.filter?.toLowerCase() ?? '') &&
									(!form?.type || item.type === form?.type),
							)
							.sort(
								(a: NgDocApiListItem, b: NgDocApiListItem) =>
									a.type.localeCompare(b.type) - a.name.localeCompare(b.name),
							),
					}))
					.filter((api: NgDocApiList) => api.items.length)
					.sort((a: NgDocApiList, b: NgDocApiList) => a.title.localeCompare(b.title)),
			),
			untilDestroyed(this),
		);
	}

	@ngDocMakePure
	get types(): string[] {
		return asArray(
			new Set(
				this.apiList.flatMap((api: NgDocApiList) => api.items).flatMap((item: NgDocApiListItem) => item.type),
			),
		);
	}
}
