import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import {
  NgDocPlaygroundForm,
  NgDocPlaygroundPropertiesComponent,
} from '@ng-doc/app/components/playground';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import {
  NgDocBooleanControlComponent,
  NgDocNumberControlComponent,
  NgDocStringControlComponent,
  NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import { NgDocPlaygroundProperties } from '@ng-doc/core/interfaces';
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; tooltips await `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

const PROPERTIES: NgDocPlaygroundProperties = {
  label: { type: 'string', inputName: 'label', description: 'Text of the tag' },
  color: { type: 'NgDocColor', inputName: 'color', options: ["'primary'", "'alert'"] },
  rounded: { type: 'boolean', inputName: 'rounded' },
};

@Component({
  selector: 'ng-doc-properties-host',
  template: `
    <ng-doc-playground-properties
      [form]="form"
      [properties]="properties"
      [defaultValues]="defaults"
      [showResetButton]="changed()"
      [inspectorPosition]="position()"
      [(recreateDemo)]="recreate"
      (resetForm)="resets = resets + 1">
      <div class="demo">Demo</div>
    </ng-doc-playground-properties>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent],
})
class PropertiesHostComponent {
  readonly properties: NgDocPlaygroundProperties = PROPERTIES;
  readonly defaults: Record<string, unknown> = { label: 'Tag', color: 'primary', rounded: false };
  readonly form = new FormGroup<NgDocPlaygroundForm>({
    properties: new FormGroup<Record<string, FormControl<unknown>>>({
      label: new FormControl<unknown>('Tag'),
      color: new FormControl<unknown>('primary'),
      rounded: new FormControl<unknown>(false),
    }),
    content: new FormGroup<Record<string, FormControl<boolean>>>({}),
  });
  readonly changed = signal<boolean>(false);
  readonly recreate = signal<boolean>(false);
  readonly position = signal<'right' | 'bottom'>('right');
  resets = 0;
}

describeChangeDetection(
  'NgDocPlaygroundPropertiesComponent',
  ({ providers }: ChangeDetectionCase) => {
    let fixture: ComponentFixture<PropertiesHostComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
          provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
          provideTypeControl('boolean', NgDocBooleanControlComponent, {
            hideLabel: true,
            order: 40,
          }),
        ],
      });
      fixture = TestBed.createComponent(PropertiesHostComponent);
      await fixture.whenStable();
      // Type controls are created after the first render.
      await fixture.whenStable();
    });

    const query = <T extends Element = HTMLElement>(selector: string): T | null =>
      fixture.nativeElement.querySelector(selector);
    const queryAll = (selector: string): HTMLElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll(selector));

    it('renders the demos beside a control per input, in provider order', () => {
      expect(query('.ng-doc-playground-demos .demo')?.textContent).toBe('Demo');
      expect(query('.ng-doc-playground-header h4')?.textContent?.trim()).toBe('Playground');
      expect(
        queryAll('ng-doc-playground-property').map(
          (row: HTMLElement) => row.querySelector('.ng-doc-playground-property-name')?.textContent,
        ),
      ).toEqual(['color', 'label', undefined]);
      // The type chip sits under the name: `string` for the alias of string literals.
      expect(
        queryAll('ng-doc-playground-property ng-doc-kind-icon').map((chip: HTMLElement) =>
          chip.getAttribute('data-ng-doc-kind'),
        ),
      ).toEqual(['string', 'string']);
      // The boolean control carries its own label.
      expect(query('ng-doc-boolean-control')?.textContent?.trim()).toBe('rounded');
    });

    it('edits the form from a control', async () => {
      const input: HTMLInputElement | null = query('ng-doc-string-control input');

      input!.value = 'Changed';
      input!.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(fixture.componentInstance.form.value.properties?.['label']).toBe('Changed');
    });

    it('shows Reset when the form changed and reports a reset', async () => {
      expect(query('.ng-doc-playground-reset')).toBeNull();

      fixture.componentInstance.changed.set(true);
      await fixture.whenStable();

      query<HTMLButtonElement>('.ng-doc-playground-reset')!.click();

      expect(fixture.componentInstance.resets).toBe(1);
    });

    it('moves the inspector below the demos when asked', async () => {
      const wrapper = () => query('.ng-doc-playground-properties-wrapper')!;

      expect(wrapper().classList.contains('inspector-bottom')).toBe(false);

      fixture.componentInstance.position.set('bottom');
      await fixture.whenStable();

      expect(wrapper().classList.contains('inspector-bottom')).toBe(true);
      // The demos still come first, then the inspector with the same controls.
      expect(Array.from(wrapper().children, (child: Element) => child.className)).toEqual([
        'ng-doc-playground-demos',
        'ng-doc-playground-properties',
      ]);
      expect(queryAll('.ng-doc-playground-property-list ng-doc-playground-property')).toHaveLength(
        3,
      );
    });

    it('binds the Recreate setting both ways', async () => {
      query<HTMLInputElement>('.ng-doc-playground-setting input')!.click();
      await fixture.whenStable();

      expect(fixture.componentInstance.recreate()).toBe(true);
    });
  },
);

/**
 * Types of optional and nullable inputs, as both engines print them: `@Input() label?: string`,
 * `input<string>()` and `model<number>()` are `string | undefined` and `number | undefined`.
 */
const OPTIONAL_PROPERTIES: NgDocPlaygroundProperties = {
  label: { type: 'string | undefined', inputName: 'label', options: ['undefined', 'string'] },
  count: { type: 'undefined | number', inputName: 'count', options: ['undefined', 'number'] },
  checked: {
    type: 'boolean | null | undefined',
    inputName: 'checked',
    options: ['undefined', 'null', 'false', 'true'],
  },
  size: { type: "'s' | 'm' | undefined", inputName: 'size', options: ["'s'", "'m'", 'undefined'] },
  // A custom control is matched by its exact type name only.
  position: {
    type: 'Position | undefined',
    inputName: 'position',
    options: ['undefined', 'Position'],
  },
  // No primitive: the members of a function or an array are not the input's.
  factory: { type: '() => string | undefined', inputName: 'factory' },
  list: { type: 'Array<string | undefined>', inputName: 'list' },
  nothing: { type: 'undefined', inputName: 'nothing' },
};

@Component({
  selector: 'ng-doc-optional-properties-host',
  template: `<ng-doc-playground-properties
    [form]="form"
    [properties]="properties"
    [defaultValues]="{}" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent],
})
class OptionalPropertiesHostComponent {
  readonly properties: NgDocPlaygroundProperties = OPTIONAL_PROPERTIES;
  readonly form = new FormGroup<NgDocPlaygroundForm>({
    properties: new FormGroup<Record<string, FormControl<unknown>>>(
      Object.fromEntries(
        Object.keys(OPTIONAL_PROPERTIES).map((key: string) => [
          key,
          new FormControl<unknown>(null),
        ]),
      ),
    ),
    content: new FormGroup<Record<string, FormControl<boolean>>>({}),
  });
}

@Component({ selector: 'ng-doc-position-control', template: 'position' })
class PositionControlComponent {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

describeChangeDetection(
  'NgDocPlaygroundPropertiesComponent with optional and nullable inputs',
  ({ providers }: ChangeDetectionCase) => {
    let fixture: ComponentFixture<OptionalPropertiesHostComponent>;
    let warn: MockInstance;

    beforeEach(async () => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
          provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
          provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
          provideTypeControl('boolean', NgDocBooleanControlComponent, {
            hideLabel: true,
            order: 40,
          }),
          provideTypeControl('Position', PositionControlComponent, { order: 50 }),
        ],
      });
      fixture = TestBed.createComponent(OptionalPropertiesHostComponent);
      await fixture.whenStable();
      await fixture.whenStable();
    });

    it('gives an optional or nullable primitive the control of the primitive', () => {
      const rows: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('ng-doc-playground-property'),
      );
      const control = (row: HTMLElement): string | undefined =>
        Array.from(row.querySelectorAll('*'))
          .map((element: Element) => element.tagName.toLowerCase())
          .find((tag: string) => /^ng-doc-(.*-control)$/.test(tag));

      expect(rows.map(control)).toEqual([
        'ng-doc-type-alias-control',
        'ng-doc-string-control',
        'ng-doc-number-control',
        'ng-doc-boolean-control',
      ]);
      expect(fixture.nativeElement.querySelector('ng-doc-position-control')).toBeNull();
      expect(
        warn.mock.calls.map(([message]: unknown[]) => /@Input "(\w+)"/.exec(String(message))?.[1]),
      ).toEqual(['position', 'factory', 'list', 'nothing']);
    });

    afterEach(() => warn.mockRestore());
  },
);

/** A control with several interactive parts, as a custom type control may have. */
@Component({
  selector: 'ng-doc-list-control',
  template: `<input class="list-filter" (click)="clicks = clicks + 1" /><span class="list-area"
      >Area</span
    >`,
})
class ListControlComponent {
  clicks = 0;
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

const LIST_PROPERTIES: NgDocPlaygroundProperties = {
  items: { type: 'Items', inputName: 'items', description: 'The items' },
  hidden: { type: 'HiddenItems', inputName: 'hidden' },
  wrapped: { type: 'WrappedItems', inputName: 'wrapped' },
};

@Component({
  selector: 'ng-doc-list-properties-host',
  template: `<ng-doc-playground-properties
    [form]="form"
    [properties]="properties"
    [defaultValues]="{}" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent],
})
class ListPropertiesHostComponent {
  readonly properties: NgDocPlaygroundProperties = LIST_PROPERTIES;
  readonly form = new FormGroup<NgDocPlaygroundForm>({
    properties: new FormGroup<Record<string, FormControl<unknown>>>({
      items: new FormControl<unknown>(null),
      hidden: new FormControl<unknown>(null),
      wrapped: new FormControl<unknown>(null),
    }),
    content: new FormGroup<Record<string, FormControl<boolean>>>({}),
  });
}

describeChangeDetection(
  'NgDocPlaygroundPropertiesComponent with labelWrapper',
  ({ providers }: ChangeDetectionCase) => {
    let fixture: ComponentFixture<ListPropertiesHostComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideTypeControl('Items', ListControlComponent, { labelWrapper: false, order: 1 }),
          provideTypeControl('HiddenItems', ListControlComponent, {
            labelWrapper: false,
            hideLabel: true,
            order: 2,
          }),
          provideTypeControl('WrappedItems', ListControlComponent, { order: 3 }),
        ],
      });
      fixture = TestBed.createComponent(ListPropertiesHostComponent);
      await fixture.whenStable();
      await fixture.whenStable();
    });

    const rows = (): HTMLElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll('ng-doc-playground-property'));
    const wrapper = (row: HTMLElement): HTMLElement =>
      row.querySelector('.ng-doc-playground-property-label')!;

    it('renders the row as a div named by its caption', () => {
      const row: HTMLElement = wrapper(rows()[0]);
      const captionId: string | null = row.getAttribute('aria-labelledby');

      expect(row.tagName).toBe('DIV');
      expect(row.getAttribute('role')).toBe('group');
      expect(captionId).toBeTruthy();
      // The accessible name of the group is the caption: the input's name.
      expect(
        fixture.nativeElement
          .querySelector(`#${captionId}`)
          ?.querySelector('.ng-doc-playground-property-name')?.textContent,
      ).toBe('items');
      expect(row.querySelector('ng-doc-list-control')).not.toBeNull();
    });

    it('gives each row its own caption ID', () => {
      const ids: Array<string | null> = rows().map(
        (row: HTMLElement) =>
          wrapper(row).querySelector('.ng-doc-label')?.getAttribute('id') ?? null,
      );

      expect(ids[0]).not.toBeNull();
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('leaves out the caption and the reference when the label is hidden', () => {
      const row: HTMLElement = wrapper(rows()[1]);

      expect(row.tagName).toBe('DIV');
      expect(row.hasAttribute('aria-labelledby')).toBe(false);
      expect(row.querySelector('.ng-doc-label')).toBeNull();
      expect(row.querySelector('ng-doc-list-control')).not.toBeNull();
    });

    it('keeps the label of other controls', () => {
      expect(wrapper(rows()[2]).tagName).toBe('LABEL');
    });

    it('does not forward clicks inside the control to its first field', () => {
      const clicks = (row: HTMLElement): number =>
        fixture.debugElement.query(
          (debug) => debug.nativeElement === row.querySelector('ng-doc-list-control'),
        ).componentInstance.clicks;
      const [unwrapped, , wrapped] = rows();

      unwrapped.querySelector<HTMLElement>('.list-area')!.click();
      wrapped.querySelector<HTMLElement>('.list-area')!.click();

      expect(clicks(unwrapped)).toBe(0);
      // A label forwards the click to the input, the behaviour the option turns off.
      expect(clicks(wrapped)).toBe(1);
    });
  },
);
