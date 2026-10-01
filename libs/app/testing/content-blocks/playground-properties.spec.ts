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
