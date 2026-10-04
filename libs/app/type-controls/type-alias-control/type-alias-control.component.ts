import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NgDocExtractValuePipe } from '@ng-doc/app/pipes/extract-value';
import {
  NgDocButtonIconComponent,
  NgDocComboboxComponent,
  NgDocDataDirective,
  NgDocFocusableDirective,
  NgDocIconComponent,
  NgDocListComponent,
  NgDocOptionComponent,
} from '@ng-doc/ui-kit';
import { DIControl } from 'di-controls';

/**
 * The playground control of union type aliases: a select that shows the value and whether it is
 * the default. The inspector shows the value type under the input's name.
 */
@Component({
  selector: 'ng-doc-type-alias-control',
  templateUrl: './type-alias-control.component.html',
  styleUrls: ['./type-alias-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocComboboxComponent,
    FormsModule,
    NgDocDataDirective,
    NgDocListComponent,
    NgDocOptionComponent,
    NgTemplateOutlet,
    NgDocButtonIconComponent,
    NgDocFocusableDirective,
    NgDocIconComponent,
    NgDocExtractValuePipe,
  ],
})
export class NgDocTypeAliasControlComponent<T> extends DIControl<T> implements NgDocTypeControl<T> {
  /** Default value of the input; clearing the selection returns to it. */
  readonly default = input<T | undefined>(undefined);

  /** Values the input accepts: literal source text, or plain values when `isManual` is set. */
  readonly options = input<string[] | undefined>(undefined);

  /** Whether `options` are values the user listed in the playground config. */
  readonly isManual = input<boolean | undefined>(undefined);

  constructor() {
    super();
  }

  typeOf(value: unknown): string {
    return typeof value;
  }

  changeModel(value: T | null): void {
    const defaultValue: T | undefined = this.default();

    this.updateModel(value === null && defaultValue ? defaultValue : value);
  }
}
