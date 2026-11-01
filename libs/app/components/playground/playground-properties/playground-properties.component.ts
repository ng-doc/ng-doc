import { KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  Injector,
  input,
  isDevMode,
  model,
  output,
  Signal,
} from '@angular/core';
import { FormControl, FormGroup, FormsModule } from '@angular/forms';
import { isPlaygroundProperty, resolvePlaygroundOption } from '@ng-doc/app/helpers';
import { NgDocPlaygroundTexts, NgDocProvidedTypeControl } from '@ng-doc/app/interfaces';
import { getTokenForType } from '@ng-doc/app/providers/type-control';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import {
  NgDocPlaygroundContent,
  NgDocPlaygroundOption,
  NgDocPlaygroundProperties,
  NgDocPlaygroundProperty,
} from '@ng-doc/core/interfaces';
import {
  NgDocBindPipe,
  NgDocCheckboxComponent,
  NgDocExecutePipe,
  NgDocIconComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

import {
  ARRAY_CONTROL_TYPE,
  arrayType,
  NgDocArrayType,
  UNION_ARRAY_CONTROL_TYPE,
} from '../playground-array-type';
import { NgDocPlaygroundForm } from '../playground-form';
import { NgDocPlaygroundPropertyComponent } from '../playground-property/playground-property.component';
import { NgDocPlaygroundPropertyControl } from '../playground-property-control';

/**
 * Orders inputs without an `order` by name in English whatever the locale, so a prerendered
 * playground does not depend on the machine that built it.
 */
const INPUT_ORDER = new Intl.Collator('en');

/**
 * The playground inspector: the demos, and beside them (below them in a container narrower than
 * 640px) the Recreate setting and a control per input and content slot.
 */
@Component({
  selector: 'ng-doc-playground-properties',
  templateUrl: './playground-properties.component.html',
  styleUrls: ['./playground-properties.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocCheckboxComponent,
    FormsModule,
    NgDocTooltipDirective,
    NgDocIconComponent,
    NgDocPlaygroundPropertyComponent,
    KeyValuePipe,
    NgDocBindPipe,
    NgDocExecutePipe,
  ],
})
export class NgDocPlaygroundPropertiesComponent<
  P extends NgDocPlaygroundProperties,
  C extends Record<string, NgDocPlaygroundContent>,
> {
  protected readonly texts: NgDocPlaygroundTexts = inject(NG_DOC_TEXTS).playground;

  private readonly injector = inject(Injector);

  /** The form of the playground. */
  readonly form = input.required<FormGroup<NgDocPlaygroundForm>>();

  /** The inputs of the playground's target. */
  readonly properties = input<P | undefined>(undefined);

  /** Inputs that get no control. */
  readonly ignoreInputs = input<string[] | undefined>([]);

  /** Content slots of the playground. */
  readonly dynamicContent = input<C | undefined>(undefined);

  /** Default values of the inputs; the inspector renders once they are known. */
  readonly defaultValues = input<Record<string, unknown> | undefined>(undefined);

  /**
   * Whether the demos render before the defaults are known: an isolated playground's iframes
   * report them, so they must render first. The controls render once the defaults are known.
   */
  readonly waitingForDefaults = input<boolean>(false);

  /** Whether the inspector is hidden, leaving the demos only. */
  readonly hideSidePanel = input<boolean>(false);

  /** Where the inspector goes: right of the demos, or below them at full width. */
  readonly inspectorPosition = input<'right' | 'bottom'>('right');

  /** Whether the demo is recreated each time an input changes. */
  readonly recreateDemo = model<boolean>(false);

  /** Whether the Recreate setting is fixed by the playground's options and hidden. */
  readonly recreateLocked = input<boolean>(false);

  /** Whether the Reset button is shown. */
  readonly showResetButton = input<boolean>(false);

  /** Emits when the reader resets the form. */
  readonly resetForm = output<void>();

  /** The control of each input, in display order. */
  protected readonly propertyControls: Signal<NgDocPlaygroundPropertyControl[]> = computed(() => {
    const properties: P | undefined = this.properties();
    const ignoreInputs: string[] | undefined = this.ignoreInputs();

    if (!properties) {
      return [];
    }

    return objectKeys(properties)
      .filter((key: keyof P) => ignoreInputs?.includes(String(key)) !== true)
      .map((key: keyof P) => {
        const property: NgDocPlaygroundProperty = properties[key];
        const typeControl: NgDocProvidedTypeControl | undefined = this.getTypeControl(property);

        return typeControl ? { propertyName: String(key), property, typeControl } : null;
      })
      .filter(isPresent)
      .sort(
        (a: NgDocPlaygroundPropertyControl, b: NgDocPlaygroundPropertyControl) =>
          compareOrder(a.property.order, b.property.order) ?? compareByTypeControl(a, b),
      );
  });

  /**
   * The controls in sections: the inputs without a group first, then a section per group, in the
   * order of the group's first input.
   */
  protected readonly propertySections: Signal<NgDocPlaygroundPropertySection[]> = computed(() => {
    const sections = new Map<string | undefined, NgDocPlaygroundPropertyControl[]>([
      [undefined, []],
    ]);

    for (const control of this.propertyControls()) {
      const group: string | undefined = control.property.group || undefined;

      sections.set(group, [...(sections.get(group) ?? []), control]);
    }

    return Array.from(sections, ([group, controls]) => ({
      title: group ?? this.texts.settings,
      controls,
    })).filter((section: NgDocPlaygroundPropertySection) => section.controls.length > 0);
  });

  /** The control of content slots. */
  protected readonly contentTypeControl?: NgDocProvidedTypeControl =
    this.getControlForType('boolean');

  /**
   * The form control of an input or a content slot.
   * @param controlType - `properties` or `content`.
   * @param key - Name of the input or slot.
   */
  getFormControl(controlType: keyof NgDocPlaygroundForm, key: string): FormControl {
    return this.form().get(controlType)?.get(key) as FormControl;
  }

  private getTypeControl(property: NgDocPlaygroundProperty): NgDocProvidedTypeControl | undefined {
    const type: string = property.type;
    const primitive: string | undefined = optionalPrimitive(type);
    const array: NgDocArrayType | undefined = arrayType(type);
    const options: Array<string | NgDocPlaygroundOption> | undefined = isPlaygroundProperty(
      property,
    )
      ? property.options
      : undefined;
    // The options of an array are the values of its items, when they are a union of literals.
    const typeControl: NgDocProvidedTypeControl | undefined =
      this.getControlForType(type) ??
      (primitive ? this.getControlForType(primitive) : undefined) ??
      (array?.list ? this.getControlForType(array.list) : undefined) ??
      (array
        ? this.getControlForTypeAlias(options, property.isManual, UNION_ARRAY_CONTROL_TYPE)
        : undefined) ??
      (array ? this.getControlForType(ARRAY_CONTROL_TYPE) : undefined) ??
      this.getControlForTypeAlias(options, property.isManual, 'NgDocTypeAlias');

    if (!typeControl && isDevMode()) {
      console.warn(
        `NgDocPlayground didn't find the control for the @Input "${property.inputName}", the type "${type}" was not recognized'`,
      );
    }

    return typeControl;
  }

  private getControlForType(type: string): NgDocProvidedTypeControl | undefined {
    const token: InjectionToken<NgDocProvidedTypeControl> | undefined = getTokenForType(type);

    return token ? this.injector.get(token) : undefined;
  }

  /**
   * The control of the values of a union, when every option is a value: the select of a union
   * (`NgDocTypeAlias`) or the multi-select of an array of one (`NgDocTypeAlias[]`). An optional
   * array input without such options has the members of its own union (`undefined` and the array
   * type), and the text of an array type is not a value of an item.
   * @param options - The options of the input.
   * @param isManual - Whether the options come from the playground's `controls`.
   * @param controlType - The type the control is registered for.
   */
  private getControlForTypeAlias(
    options: Array<string | NgDocPlaygroundOption> | undefined,
    isManual: boolean | undefined,
    controlType: string,
  ): NgDocProvidedTypeControl | undefined {
    if (!options?.length) {
      return undefined;
    }

    const values: unknown[] = [];

    try {
      // checking that all values are extractable
      options.forEach((item: string | NgDocPlaygroundOption) =>
        values.push(resolvePlaygroundOption(item, isManual).value),
      );
    } catch {
      return undefined;
    }

    // The items of an array are values: an option that evaluates to an object, such as the text
    // of a tuple type, means the options are not those of the items.
    if (
      controlType === UNION_ARRAY_CONTROL_TYPE &&
      !(
        values.every((value: unknown) => value === null || ITEM_TYPES.has(typeof value)) &&
        values.some((value: unknown) => value !== null && value !== undefined)
      )
    ) {
      return undefined;
    }

    return this.getControlForType(controlType);
  }
}

/** A titled list of controls in the inspector. */
interface NgDocPlaygroundPropertySection {
  title: string;
  controls: NgDocPlaygroundPropertyControl[];
}

/**
 * Compares the `order` of two inputs from the playground's `controls`: inputs with one come first,
 * lowest first.
 * @param a - The first input's order.
 * @param b - The second input's order.
 * @returns The comparison, or `undefined` when neither input has an order or both have the same.
 */
function compareOrder(a: number | undefined, b: number | undefined): number | undefined {
  if (isPresent(a) && isPresent(b)) {
    return a - b || undefined;
  }
  if (isPresent(a)) {
    return -1;
  }
  if (isPresent(b)) {
    return 1;
  }
  return undefined;
}

/**
 * Compares two inputs by the order of their type controls: controls with an order first, lowest
 * first (equal orders keep the inputs' order), then the others by name.
 * @param a - The first input.
 * @param b - The second input.
 */
function compareByTypeControl(
  a: NgDocPlaygroundPropertyControl,
  b: NgDocPlaygroundPropertyControl,
): number {
  const aOrder: number | undefined = a.typeControl.options?.order;
  const bOrder: number | undefined = b.typeControl.options?.order;

  if (isPresent(aOrder) && isPresent(bOrder)) {
    return aOrder - bOrder;
  }
  if (isPresent(aOrder)) {
    return -1;
  }
  if (isPresent(bOrder)) {
    return 1;
  }
  return INPUT_ORDER.compare(a.property.inputName, b.property.inputName);
}

/** The types of the values that an item of the multi-select of a union can have. */
const ITEM_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'undefined']);

/** The types whose control also edits an optional or nullable input of the type. */
const PRIMITIVE_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'boolean']);

/**
 * The primitive of an optional or nullable primitive input type, such as `string` of
 * `string | undefined` (an optional `@Input() label?: string`, `input<string>()` or
 * `model<string>()`) or of `number | null`, so that the input gets the primitive's control.
 * Other types are matched by their exact name only (arrays of strings and numbers aside, see
 * `arrayType`): a custom control registered for `Position` does not receive the `undefined` of a
 * `Position | undefined` input unless it is registered for that type too.
 * @param type - The input type as the builder printed it.
 * @returns The primitive, or `undefined` when the type is not one.
 */
function optionalPrimitive(type: string): string | undefined {
  const members: string[] = type.split('|').map((member: string) => member.trim());
  const rest: string[] = members.filter(
    (member: string) => member !== 'undefined' && member !== 'null',
  );

  return rest.length === 1 && rest.length < members.length && PRIMITIVE_TYPES.has(rest[0])
    ? rest[0]
    : undefined;
}
