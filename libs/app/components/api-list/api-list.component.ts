import { AsyncPipe, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
} from '@angular/core';
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
  NgDocComboboxComponent,
  NgDocDataDirective,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocLabelComponent,
  NgDocListComponent,
  NgDocOptionComponent,
  NgDocTextComponent,
  NgDocTextLeftDirective,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { ngDocMakePure } from '@ng-doc/ui-kit/decorators';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { debounceTime, map, startWith } from 'rxjs/operators';

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
  standalone: true,
  imports: [
    NgDocTextComponent,
    NgIf,
    FormsModule,
    ReactiveFormsModule,
    NgDocLabelComponent,
    NgDocInputWrapperComponent,
    NgDocIconComponent,
    NgDocInputStringDirective,
    NgDocAutofocusDirective,
    NgDocComboboxComponent,
    NgDocDataDirective,
    NgDocListComponent,
    NgFor,
    NgDocOptionComponent,
    NgTemplateOutlet,
    NgDocKindIconComponent,
    NgDocTextLeftDirective,
    NgDocTooltipDirective,
    RouterLink,
    AsyncPipe,
  ],
})
@UntilDestroy()
export class NgDocApiListComponent {
  @Input()
  segment?: string;

  protected formGroup: FormGroup<ApiFilterForm>;
  protected api$: Observable<NgDocApiList[]>;
  protected apiList: NgDocApiList[] = [];

  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly httpClient = inject(HttpClient);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    this.formGroup = this.formBuilder.group({
      filter: [''],
      scope: [''],
      type: [''],
    });

    this.route.queryParamMap.pipe(untilDestroyed(this)).subscribe((paramMap: ParamMap) =>
      this.formGroup.setValue({
        filter: paramMap.get('filter') || null,
        scope: paramMap.get('scope') || null,
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
          .filter((api: NgDocApiList) => !form?.scope || api.title === form?.scope)
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
          .filter((api: NgDocApiList) => api.items.length),
      ),
      untilDestroyed(this),
    );

    this.httpClient
      .get<NgDocApiList[]>(asArray('assets/ng-doc', this.segment, 'api-list.json').join('/'))
      .subscribe((apiList: NgDocApiList[]) => {
        this.apiList = apiList;
        this.changeDetectorRef.markForCheck();
      });
  }

  @ngDocMakePure
  get scopes(): string[] {
    return asArray(new Set(this.apiList.flatMap((api: NgDocApiList) => api.title))).sort();
  }

  @ngDocMakePure
  get types(): string[] {
    return asArray(
      new Set(
        this.apiList
          .flatMap((api: NgDocApiList) => api.items)
          .flatMap((item: NgDocApiListItem) => item.type),
      ),
    ).sort();
  }
}
