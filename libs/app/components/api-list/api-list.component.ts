import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {FormBuilder, FormControl, FormGroup} from '@angular/forms';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {NG_DOC_API_LIST_TOKEN} from '@ng-doc/app/tokens';
import {NgDocFormPartialValue} from '@ng-doc/app/types';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NgDocApiList, NgDocApiListItem} from '@ng-doc/core/interfaces';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Observable} from 'rxjs';
import {debounceTime, map, startWith} from 'rxjs/operators';

interface ApiFilterForm {
	filter: FormControl<string | null>;
	type: FormControl<string | null>;
}

@Component({
	selector: 'ng-doc-api-list',
	templateUrl: './api-list.component.html',
	styleUrls: ['./api-list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocApiListComponent {
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
									a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
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
		).sort();
	}
}
