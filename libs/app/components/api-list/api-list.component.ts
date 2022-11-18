import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {FormBuilder, FormControl, FormGroup} from '@angular/forms';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {NG_DOC_API_LIST_TOKEN} from '@ng-doc/app/tokens';
import {NgDocFormPartialValue} from '@ng-doc/app/types';
import {NgDocApiList, NgDocApiListItem} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Observable} from 'rxjs';
import {debounceTime, map, startWith} from 'rxjs/operators';

interface ApiFilterForm {
	filter: FormControl<string | null>;
	type: FormControl<string | null>;
}

/**
 * Decorator that binds a DOM event to a host listener and supplies configuration metadata.
 * Angular invokes the supplied handler method when the host element emits the specified event,
 * and updates the bound element with the result.12
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
 * @usageNotes
 *
 * alsdkjalskdj
 * sda
 *
 * asdas
 * d asda
 *
 *  as dasdas
 *
 *  asdasdasdasdas
 *  a
 *  sdasdasdasd
 */
@Component({
	selector: 'ng-doc-api-list',
	templateUrl: './api-list.component.html',
	styleUrls: ['./api-list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocApiListComponent {
	/**
	 * My comment
	 */
	formGroup: FormGroup<ApiFilterForm>;
	api$: Observable<NgDocApiList[]>;

	constructor(
		@Inject(NG_DOC_API_LIST_TOKEN)
		private readonly apiList: NgDocApiList[],
		private readonly formBuilder: FormBuilder,
		private readonly route: ActivatedRoute,
		private readonly router: Router,
	) {
		this.formGroup = this.formBuilder.group({
			filter: [''],
			type: [''],
		});

		this.route.queryParamMap.pipe(untilDestroyed(this)).subscribe((paramMap: ParamMap) =>
			this.formGroup.setValue({
				filter: paramMap.get('filter') || null,
				type: paramMap.get('type') || null,
			}),
		);

		this.formGroup.valueChanges
			.pipe(untilDestroyed(this))
			.subscribe((formValue: NgDocFormPartialValue<typeof this.formGroup>) =>
				this.router.navigate([], {
					relativeTo: this.route,
					queryParams: formValue,
					queryParamsHandling: 'merge',
				}),
			);

		this.api$ = this.formGroup.valueChanges.pipe(
			debounceTime(100),
			startWith(null),
			map(() => this.formGroup.value),
			map((form: NgDocFormPartialValue<typeof this.formGroup>) =>
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
