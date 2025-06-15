import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { NgDocKindIconComponent } from '@ng-doc/app/components/kind-icon';
import { NgDocFormPartialValue } from '@ng-doc/app/types';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocApiList, NgDocApiListItem } from '@ng-doc/core/interfaces';
import {
  NgDocAutofocusDirective,
  NgDocButtonToggleComponent,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocRadioGroupDirective,
  NgDocTextComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { startWith } from 'rxjs/operators';

interface ApiFilterForm {
  filter: FormControl<string | null>;
  scope: FormControl<string | null>;
  type: FormControl<string | null>;
}

@Component({
  selector: 'ng-doc-api-list',
  templateUrl: './api-list.component.html',
  styleUrls: ['./api-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocTextComponent,
    FormsModule,
    ReactiveFormsModule,
    NgDocInputWrapperComponent,
    NgDocIconComponent,
    NgDocInputStringDirective,
    NgDocAutofocusDirective,
    NgDocKindIconComponent,
    NgDocTooltipDirective,
    RouterLink,
    NgDocRadioGroupDirective,
    NgDocButtonToggleComponent,
  ],
})
export class NgDocApiListComponent implements OnInit {
  title = input<string>('API References');
  segment = input<string>();

  apiList: WritableSignal<NgDocApiList[]> = signal([]);
  filteredApiList: Signal<NgDocApiList[]>;
  filter: Signal<any>;
  scopes: Signal<string[]>;
  types: Signal<string[]>;

  protected formGroup: FormGroup<ApiFilterForm>;

  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly httpClient = inject(HttpClient);

  constructor() {
    this.formGroup = this.formBuilder.group({
      filter: [''],
      scope: [''],
      type: [''],
    });

    this.filter = toSignal(this.formGroup.valueChanges.pipe(startWith(this.formGroup.value)), {
      initialValue: this.formGroup.value,
    });

    this.scopes = computed(() =>
      asArray(new Set(this.apiList().flatMap((api: NgDocApiList) => api.title))).sort(),
    );

    this.types = computed(() =>
      asArray(
        new Set(
          this.apiList()
            .flatMap((api: NgDocApiList) => api.items)
            .flatMap((item: NgDocApiListItem) => item.type),
        ),
      ).sort(),
    );

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((paramMap: ParamMap) =>
      this.formGroup.setValue({
        filter: paramMap.get('filter') || null,
        scope: paramMap.get('scope') || null,
        type: paramMap.get('type') || null,
      }),
    );

    this.formGroup.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((formValue: NgDocFormPartialValue<typeof this.formGroup>) =>
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: formValue,
          queryParamsHandling: 'merge',
        }),
      );

    this.filteredApiList = computed(() => {
      const { filter, scope, type } = this.filter();

      return this.apiList()
        .filter((api: NgDocApiList) => !scope || api.title === scope)
        .map((api: NgDocApiList) => ({
          ...api,
          items: api.items
            .filter(
              (item: NgDocApiListItem) =>
                item.name.toLowerCase().includes(filter?.toLowerCase() ?? '') &&
                (!type || item.type === type),
            )
            .sort(
              (a: NgDocApiListItem, b: NgDocApiListItem) =>
                a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
            ),
        }))
        .filter((api: NgDocApiList) => api.items.length);
    });
  }

  ngOnInit(): void {
    this.httpClient
      .get<NgDocApiList[]>(asArray('assets/ng-doc', this.segment(), 'api-list.json').join('/'))
      .subscribe((apiList) => this.apiList.set(apiList));
  }
}
