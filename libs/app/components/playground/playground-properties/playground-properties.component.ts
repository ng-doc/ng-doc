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
import { NgDocProvidedTypeControl } from '@ng-doc/app/interfaces';
import { getTokenForType } from '@ng-doc/app/providers/type-control';
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
      title: group ?? 'Settings',
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
    const typeControl: NgDocProvidedTypeControl | undefined =
      this.getControlForType(type) ??
      (primitive ? this.getControlForType(primitive) : undefined) ??
      (array?.list ? this.getControlForType(array.list) : undefined) ??
      (array ? this.getControlForType(ARRAY_CONTROL_TYPE) : undefined) ??
      this.getControlForTypeAlias(
        isPlaygroundProperty(property) ? property.options : undefined,
        property.isManual,
      );

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

  private getControlForTypeAlias(
    options?: Array<string | NgDocPlaygroundOption>,
    isManual?: boolean,
  ): NgDocProvidedTypeControl | undefined {
    if (options && options.length) {
      let optionsIsValid: boolean = true;

      try {
        // checking that all values are extractable
        options.forEach((item: string | NgDocPlaygroundOption) =>
          resolvePlaygroundOption(item, isManual),
        );
      } catch {
        optionsIsValid = false;
      }

      if (optionsIsValid) {
        const token: InjectionToken<NgDocProvidedTypeControl> | undefined =
          getTokenForType('NgDocTypeAlias');

        return token ? this.injector.get(token) : undefined;
      }
    }

    return undefined;
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

/**
 * The type that the control of array types without a control of their own is registered for.
 * NgDoc registers its JSON field for it, and `controls` can name it for an input.
 */
const ARRAY_CONTROL_TYPE: string = 'NgDocArray';

/** The item types whose arrays get the control registered for `<item>[]`, a list by default. */
const LIST_ITEM_TYPES: ReadonlySet<string> = new Set(['string', 'number']);

/** Keywords that make a type ending in `[]` another type than an array, as in `keyof Item[]`. */
const TYPE_OPERATOR: RegExp = /^(?:keyof|typeof|unique|infer|asserts|new)\s/;

/** An input type that is an array or a tuple. */
interface NgDocArrayType {
  /** `string[]` or `number[]` for an array of strings or numbers, whatever its spelling. */
  list?: string;
}

/**
 * Reads an input type as an array type: `T[]` (as both engines print an array), `Array<T>`,
 * `readonly T[]`, `ReadonlyArray<T>` or a tuple such as `[string, number]`, alone or in a union
 * with `undefined` or `null` (an optional or nullable input). An array of strings or numbers gets
 * the control of `string[]` or `number[]`, so a control registered for that type replaces the
 * built-in list for every spelling; any other array gets the control of `NgDocArray`, the JSON
 * field. A type alias of an array (`type Tags = string[]`) is printed by its name and is not
 * recognized: register a control for the name.
 * @param type - The input type as the builder printed it.
 * @returns What the array type is, or `undefined` when the type is not one.
 */
function arrayType(type: string): NgDocArrayType | undefined {
  const members: string[] = splitTopLevel(type);
  const rest: string[] = members.filter(
    (member: string) => member !== 'undefined' && member !== 'null',
  );

  if (rest.length !== 1) {
    return undefined;
  }

  const written: string = unwrapParentheses(rest[0]).replace(/^readonly\s+/, '');
  const item: string | undefined = arrayItem(written);

  if (item !== undefined) {
    return LIST_ITEM_TYPES.has(item) ? { list: `${item}[]` } : {};
  }

  return written.startsWith('[') && written.endsWith(']') && isBalanced(written.slice(1, -1))
    ? {}
    : undefined;
}

/**
 * The item type of `T[]`, `Array<T>` or `ReadonlyArray<T>`.
 * @param type - A type that is not a union.
 */
function arrayItem(type: string): string | undefined {
  const generic: RegExpExecArray | null = /^(?:Readonly)?Array<([\s\S]*)>$/.exec(type);

  if (generic) {
    return isBalanced(generic[1]) ? unwrapParentheses(generic[1].trim()) : undefined;
  }

  if (!type.endsWith('[]') || TYPE_OPERATOR.test(type)) {
    return undefined;
  }

  const item: string = type.slice(0, -2).trim();

  // `() => string[]` is a function, and `A extends B ? C[] : D[]` a conditional type.
  const text: string | undefined = item ? topLevelText(item) : undefined;

  return text !== undefined && !/=>|\?/.test(text) ? unwrapParentheses(item) : undefined;
}

/**
 * Splits a type at the `|` of its top-level union, outside brackets and string literals.
 * @param type - The type.
 */
function splitTopLevel(type: string): string[] {
  const text: string | undefined = topLevelText(type);

  if (text === undefined) {
    return [type.trim()];
  }

  const members: string[] = [];
  let start: number = 0;

  for (let index = 0; index < text.length; index++) {
    if (text[index] === '|') {
      members.push(type.slice(start, index).trim());
      start = index + 1;
    }
  }

  return [...members, type.slice(start).trim()];
}

/**
 * Removes the parentheses around a whole type, such as those of `(string | number)`.
 * @param type - The type.
 */
function unwrapParentheses(type: string): string {
  let result: string = type.trim();

  while (result.startsWith('(') && result.endsWith(')') && isBalanced(result.slice(1, -1))) {
    result = result.slice(1, -1).trim();
  }

  return result;
}

/**
 * Whether every bracket and string literal of a type is closed in it.
 * @param type - The type.
 */
function isBalanced(type: string): boolean {
  return topLevelText(type) !== undefined;
}

/**
 * The type with every character inside brackets or a string literal replaced by a space, so that
 * the operators of the type itself can be found by position; `undefined` when a bracket or a string
 * is not closed. The `>` of an arrow (`=>`) closes no bracket.
 * @param type - The type.
 */
function topLevelText(type: string): string | undefined {
  let depth: number = 0;
  let quote: string | undefined;
  let text: string = '';

  for (let index = 0; index < type.length; index++) {
    const char: string = type[index];

    if (quote) {
      if (char === '\\') {
        index++;
        text += '  ';
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      text += ' ';
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      text += ' ';
    } else if ('([{<'.includes(char)) {
      depth++;
      text += ' ';
    } else if (char === '>' && type[index - 1] === '=') {
      text += depth ? ' ' : char;
    } else if (')]}>'.includes(char)) {
      depth--;
      text += ' ';

      if (depth < 0) {
        return undefined;
      }
    } else {
      text += depth ? ' ' : char;
    }
  }

  return depth === 0 && !quote ? text : undefined;
}
