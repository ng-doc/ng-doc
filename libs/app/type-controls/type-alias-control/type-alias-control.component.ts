import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgDocResolvedPlaygroundOption, resolvePlaygroundOption } from '@ng-doc/app/helpers';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NgDocPlaygroundOption } from '@ng-doc/core/interfaces';
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
 * The playground control of union type aliases and enums: a select that shows the value (or the
 * name of an enum member) and whether it is the default. The inspector shows the value type under
 * the input's name.
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
  ],
})
export class NgDocTypeAliasControlComponent<T> extends DIControl<T> implements NgDocTypeControl<T> {
  /** Default value of the input; clearing the selection returns to it. */
  readonly default = input<T | undefined>(undefined);

  /**
   * Values the input accepts: literal source text, plain values when `isManual` is set, or the
   * names and values of enum members.
   */
  readonly options = input<Array<string | NgDocPlaygroundOption> | undefined>(undefined);

  /** Whether `options` are values the user listed in the playground config. */
  readonly isManual = input<boolean | undefined>(undefined);

  /**
   * The options of the select. `undefined` and `null` get no option: clearing the selection
   * returns to the default value instead.
   */
  protected readonly items: Signal<NgDocResolvedPlaygroundOption[]> = computed(() => {
    const isManual: boolean | undefined = this.isManual();

    return (this.options() ?? []).flatMap((option: string | NgDocPlaygroundOption) => {
      try {
        const item: NgDocResolvedPlaygroundOption = resolvePlaygroundOption(option, isManual);

        return item.value === undefined || item.value === null ? [] : [item];
      } catch {
        return [];
      }
    });
  });

  constructor() {
    super();
  }

  typeOf(value: unknown): string {
    return typeof value;
  }

  /**
   * The text of a value: the name of its option, such as the name of an enum member.
   * @param value - A value of the input.
   */
  labelOf(value: unknown): string {
    return (
      this.items().find((item: NgDocResolvedPlaygroundOption) => item.value === value)?.label ??
      String(value ?? '')
    );
  }

  /**
   * Whether the reset button is shown: a value other than the default is selected.
   * @param value - The selected value.
   */
  protected canReset(value: T | null): boolean {
    return value !== undefined && value !== null && value !== this.default();
  }

  changeModel(value: T | null): void {
    const defaultValue: T | undefined = this.default();

    this.updateModel(value === null && defaultValue ? defaultValue : value);
  }
}
