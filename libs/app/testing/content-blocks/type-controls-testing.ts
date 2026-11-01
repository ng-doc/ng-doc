import { ChangeDetectionStrategy, Component, Provider } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import {
  NgDocPlaygroundForm,
  NgDocPlaygroundPropertiesComponent,
} from '@ng-doc/app/components/playground';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import {
  NgDocBooleanControlComponent,
  NgDocJsonControlComponent,
  NgDocNumberControlComponent,
  NgDocNumberListControlComponent,
  NgDocStringControlComponent,
  NgDocStringListControlComponent,
  NgDocTypeAliasControlComponent,
  NgDocTypeAliasListControlComponent,
} from '@ng-doc/app/type-controls';
import { NgDocPlaygroundProperties } from '@ng-doc/core/interfaces';

/**
 * The built-in type controls, registered as `NgDocPageComponent` registers them. The registry is
 * global and the last registration of a type wins, so a spec calls this before registering its
 * own controls, in every test.
 */
export function builtInTypeControls(): Provider[] {
  return [
    provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
    provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
    provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
    provideTypeControl('boolean', NgDocBooleanControlComponent, { order: 40 }),
    provideTypeControl('string[]', NgDocStringListControlComponent, {
      order: 50,
      labelWrapper: false,
    }),
    provideTypeControl('number[]', NgDocNumberListControlComponent, {
      order: 50,
      labelWrapper: false,
    }),
    provideTypeControl('NgDocTypeAlias[]', NgDocTypeAliasListControlComponent, {
      order: 50,
      labelWrapper: false,
    }),
    provideTypeControl('NgDocArray', NgDocJsonControlComponent, { order: 60 }),
  ];
}

/**
 * Array input types as both engines print them, plus `Array<T>` as `controls` may name it, with
 * the `options` the engines give them: the values of the items of an array of a union of literals,
 * and the members of the input's own union otherwise.
 */
export const ARRAY_PROPERTIES: NgDocPlaygroundProperties = {
  ...Object.fromEntries(
    Object.entries({
      tags: 'string[]',
      readonlyTags: 'readonly string[]',
      optionalTags: 'string[] | undefined',
      genericTags: 'Array<string>',
      counts: 'number[]',
      nullableCounts: 'number[] | null | undefined',
      readonlyCounts: 'readonly number[] | null',
      genericCounts: 'ReadonlyArray<number>',
      items: 'Item[]',
      optionalItems: 'Item[] | undefined',
      literalItems: '{ x: number; }[]',
      genericItems: 'Array<{ x: number }>',
      pair: '[string, number]',
      readonlyPair: 'readonly [string] | undefined',
      grid: 'string[][]',
      mixed: '(string | number)[]',
      optionalStrings: '(string | undefined)[]',
      sizes: "('s' | 'm')[]",
      named: 'NgDocArray',
      // Not arrays.
      factory: '() => string[]',
      either: 'string[] | number[]',
      keys: 'keyof Item[]',
      alias: 'Tags',
    }).map(([name, type]: [string, string]) => [name, { type, inputName: name }]),
  ),
  // Arrays of a union of literals.
  variants: { type: 'NgDocSize[]', inputName: 'variants', options: ["'small'", "'large'"] },
  optionalVariants: {
    type: "('a' | 'b')[] | undefined",
    inputName: 'optionalVariants',
    options: ["'a'", "'b'"],
  },
  statuses: {
    type: 'Status[]',
    inputName: 'statuses',
    options: [
      { label: 'Good', value: 'good' },
      { label: 'Bad', value: 'bad' },
    ],
  },
  manualVariants: {
    type: 'NgDocTypeAlias[]',
    inputName: 'manualVariants',
    options: ['x', 'y'],
    isManual: true,
  },
  // The options of an optional array: the members of its own union, not values of items.
  optionalItemsWithOptions: {
    type: 'Item[] | undefined',
    inputName: 'optionalItemsWithOptions',
    options: ['undefined', 'Item[]'],
  },
  optionalPair: {
    type: '[1, 2] | undefined',
    inputName: 'optionalPair',
    options: ['undefined', '[1, 2]'],
  },
  // A union that is not an array keeps its select.
  size: { type: 'NgDocSize', inputName: 'size', options: ["'small'", "'large'"] },
};

/** An inspector with a row for each of `ARRAY_PROPERTIES`. */
@Component({
  selector: 'ng-doc-array-properties-host',
  template: `<ng-doc-playground-properties
    [form]="form"
    [properties]="properties"
    [defaultValues]="{}" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent],
})
export class ArrayPropertiesHostComponent {
  readonly properties: NgDocPlaygroundProperties = ARRAY_PROPERTIES;
  readonly form = new FormGroup<NgDocPlaygroundForm>({
    properties: new FormGroup<Record<string, FormControl<unknown>>>(
      Object.fromEntries(
        Object.keys(ARRAY_PROPERTIES).map((key: string) => [key, new FormControl<unknown>(null)]),
      ),
    ),
    content: new FormGroup<Record<string, FormControl<boolean>>>({}),
  });
}

/**
 * The tag of the type control in each row of the inspector, by the row's name.
 * @param fixture - The fixture that renders the inspector.
 */
export function controlsByName(
  fixture: ComponentFixture<unknown>,
): Record<string, string | undefined> {
  const rows: HTMLElement[] = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('ng-doc-playground-property'),
  );

  return Object.fromEntries(
    rows.map((row: HTMLElement) => [
      row.querySelector('.ng-doc-playground-property-name')?.textContent?.trim() ?? '',
      Array.from(row.querySelectorAll('*'))
        .map((element: Element) => element.tagName.toLowerCase())
        .find((tag: string) => /^ng-doc-(.*-control)$/.test(tag)),
    ]),
  );
}
