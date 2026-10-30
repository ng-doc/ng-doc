import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideNgDocTexts } from '@ng-doc/app/providers/texts';
import {
  NgDocJsonControlComponent,
  NgDocNumberListControlComponent,
  NgDocStringListControlComponent,
} from '@ng-doc/app/type-controls';
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
import {
  ArrayPropertiesHostComponent,
  builtInTypeControls,
  controlsByName,
} from './type-controls-testing';

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

const settle = async (fixture: ComponentFixture<unknown>): Promise<void> => {
  for (let round = 0; round < 2; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
};

const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, text: string): void => {
  field.value = text;
  field.dispatchEvent(new Event('input'));
};

// ---------------------------------------------------------------------------------------------
// Which control an input type gets
// ---------------------------------------------------------------------------------------------

describeChangeDetection(
  'Playground controls of array inputs',
  ({ providers }: ChangeDetectionCase) => {
    let warn: MockInstance;

    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    const render = async (): Promise<ComponentFixture<ArrayPropertiesHostComponent>> => {
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          ...builtInTypeControls(),
        ],
      });

      const fixture: ComponentFixture<ArrayPropertiesHostComponent> = TestBed.createComponent(
        ArrayPropertiesHostComponent,
      );

      await fixture.whenStable();
      await fixture.whenStable();

      return fixture;
    };

    it('gives arrays of strings and numbers a list, and other arrays the JSON field', async () => {
      const fixture = await render();
      const list = 'ng-doc-string-list-control';
      const numbers = 'ng-doc-number-list-control';
      const json = 'ng-doc-json-control';

      expect(controlsByName(fixture)).toEqual({
        tags: list,
        readonlyTags: list,
        optionalTags: list,
        genericTags: list,
        counts: numbers,
        nullableCounts: numbers,
        readonlyCounts: numbers,
        genericCounts: numbers,
        items: json,
        optionalItems: json,
        literalItems: json,
        genericItems: json,
        pair: json,
        readonlyPair: json,
        grid: json,
        mixed: json,
        optionalStrings: json,
        sizes: json,
        named: json,
      });
      expect(
        warn.mock.calls.map(([message]: unknown[]) => /@Input "(\w+)"/.exec(String(message))?.[1]),
      ).toEqual(['factory', 'either', 'keys', 'alias']);
    });

    it('renders a list as a group named by its caption, and the JSON field in a label', async () => {
      const fixture = await render();
      const row = (control: string): HTMLElement =>
        (fixture.nativeElement as HTMLElement)
          .querySelector(control)!
          .closest('.ng-doc-playground-property-label') as HTMLElement;

      expect(row('ng-doc-string-list-control').tagName).toBe('DIV');
      expect(row('ng-doc-string-list-control').getAttribute('role')).toBe('group');
      expect(row('ng-doc-number-list-control').tagName).toBe('DIV');
      expect(row('ng-doc-json-control').tagName).toBe('LABEL');
    });
  },
);

// ---------------------------------------------------------------------------------------------
// The list controls
// ---------------------------------------------------------------------------------------------

@Component({
  selector: 'ng-doc-string-list-host',
  template: `<ng-doc-string-list-control [formControl]="control" [default]="default()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocStringListControlComponent, ReactiveFormsModule],
})
class StringListHostComponent {
  readonly control = new FormControl<string[] | null | undefined>(['a', 'b', 'c']);
  readonly default = signal<string[] | undefined>(['a', 'b', 'c']);
}

@Component({
  selector: 'ng-doc-number-list-host',
  template: `<ng-doc-number-list-control [formControl]="control" [default]="default()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocNumberListControlComponent, ReactiveFormsModule],
})
class NumberListHostComponent {
  readonly control = new FormControl<number[] | null | undefined>([1, 2]);
  readonly default = signal<number[] | undefined>(undefined);
}

describeChangeDetection('NgDocStringListControlComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<StringListHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(StringListHostComponent);
    await settle(fixture);
  });

  const host = (): HTMLElement => fixture.nativeElement;
  const fields = (): HTMLInputElement[] =>
    Array.from(host().querySelectorAll('input[data-ng-doc-list-input]'));
  const button = (index: number, part: 'up' | 'down' | 'remove'): HTMLButtonElement =>
    host().querySelector(`[data-ng-doc-list-item="${index}"] [data-ng-doc-list-${part}]`)!;
  const add = (): HTMLButtonElement => host().querySelector('[data-ng-doc-list-add]')!;
  const reset = (): HTMLButtonElement | null => host().querySelector('[data-ng-doc-list-reset]');
  const literal = (): string | undefined =>
    host().querySelector('.ng-doc-list-control-literal')?.textContent?.trim();

  it('shows a field per item, named by its position', () => {
    expect(fields().map((field: HTMLInputElement) => field.value)).toEqual(['a', 'b', 'c']);
    expect(fields().map((field: HTMLInputElement) => field.getAttribute('aria-label'))).toEqual([
      'Item 1',
      'Item 2',
      'Item 3',
    ]);
    expect(fields()[0].getAttribute('type')).toBe('text');
    expect(host().querySelectorAll('ol > li')).toHaveLength(3);
    expect(button(0, 'up').getAttribute('aria-label')).toBe('Move up');
    expect(button(0, 'down').getAttribute('aria-label')).toBe('Move down');
    expect(button(0, 'remove').getAttribute('aria-label')).toBe('Remove');
    expect(add().textContent?.trim()).toBe('Add item');
    // The value is the default: nothing to reset.
    expect(reset()).toBeNull();
    expect(literal()).toBeUndefined();
  });

  it('edits an item and reports a new array', async () => {
    const before: string[] | null | undefined = fixture.componentInstance.control.value;

    typeInto(fields()[1], 'B');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['a', 'B', 'c']);
    expect(before).toEqual(['a', 'b', 'c']);
    expect(reset()).not.toBeNull();
  });

  it('adds an item at the end and focuses its field', async () => {
    add().click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['a', 'b', 'c', '']);
    expect(fields()).toHaveLength(4);
    expect(document.activeElement).toBe(fields()[3]);
  });

  it('removes an item and focuses the field that takes its place', async () => {
    button(1, 'remove').click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['a', 'c']);
    expect(fields().map((field: HTMLInputElement) => field.value)).toEqual(['a', 'c']);
    expect(document.activeElement).toBe(fields()[1]);
  });

  it('leaves an empty array after the last item, and focuses Add', async () => {
    fixture.componentInstance.control.setValue(['only']);
    await settle(fixture);

    button(0, 'remove').click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([]);
    expect(literal()).toBe('[]');
    expect(document.activeElement).toBe(add());
  });

  it('moves items up and down, and the focus with them', async () => {
    expect(button(0, 'up').disabled).toBe(true);
    expect(button(2, 'down').disabled).toBe(true);

    button(0, 'down').click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['b', 'a', 'c']);
    expect(fields().map((field: HTMLInputElement) => field.value)).toEqual(['b', 'a', 'c']);
    // The item can move down again: the focus is on the same button of its new row.
    expect(document.activeElement).toBe(button(1, 'down'));

    button(1, 'down').click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['b', 'c', 'a']);
    // The item is last: the focus moves to the button that still works.
    expect(document.activeElement).toBe(button(2, 'up'));

    button(2, 'up').click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['b', 'a', 'c']);
    expect(document.activeElement).toBe(button(1, 'up'));
  });

  it('tells undefined, null and an empty array apart', async () => {
    fixture.componentInstance.control.setValue(undefined);
    await settle(fixture);

    expect(fields()).toHaveLength(0);
    expect(literal()).toBe('undefined');

    fixture.componentInstance.control.setValue(null);
    await settle(fixture);

    expect(literal()).toBe('null');

    fixture.componentInstance.control.setValue([]);
    await settle(fixture);

    expect(literal()).toBe('[]');

    fixture.componentInstance.control.setValue(undefined);
    await settle(fixture);
    add().click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['']);
    expect(literal()).toBeUndefined();
  });

  it('resets to the default, including undefined for an optional input', async () => {
    button(0, 'remove').click();
    await settle(fixture);

    expect(reset()?.getAttribute('aria-label')).toBe('Reset to the default value');

    reset()!.click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(['a', 'b', 'c']);
    // A copy: editing the value later never changes the default.
    expect(fixture.componentInstance.control.value).not.toBe(fixture.componentInstance.default());
    expect(reset()).toBeNull();

    fixture.componentInstance.default.set(undefined);
    await settle(fixture);
    reset()!.click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toBeUndefined();
    expect(literal()).toBe('undefined');
  });

  it('disables every part with the form control', async () => {
    fixture.componentInstance.control.disable();
    await settle(fixture);

    expect(
      Array.from(host().querySelectorAll('input, button')).every(
        (element: Element) => (element as HTMLInputElement | HTMLButtonElement).disabled,
      ),
    ).toBe(true);
  });
});

describeChangeDetection('NgDocNumberListControlComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<NumberListHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(NumberListHostComponent);
    await settle(fixture);
  });

  const fields = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[data-ng-doc-list-input]'));

  it('edits numbers as numbers', async () => {
    expect(fields()[0].getAttribute('type')).toBe('number');
    expect(fields().map((field: HTMLInputElement) => field.value)).toEqual(['1', '2']);

    typeInto(fields()[1], '42.5');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([1, 42.5]);

    typeInto(fields()[0], '-3');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([-3, 42.5]);
  });

  it('keeps the number of an item while its field has none', async () => {
    typeInto(fields()[0], '');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([1, 2]);
    expect(fields()[0].getAttribute('aria-invalid')).toBe('true');

    // Leaving the field shows the number again.
    fields()[0].dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(fields()[0].value).toBe('1');
    expect(fields()[0].hasAttribute('aria-invalid')).toBe(false);
    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('adds 0', async () => {
    (fixture.nativeElement.querySelector('[data-ng-doc-list-add]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([1, 2, 0]);
  });
});

// ---------------------------------------------------------------------------------------------
// The JSON field
// ---------------------------------------------------------------------------------------------

interface Item {
  x: number;
}

@Component({
  selector: 'ng-doc-json-host',
  template: `<ng-doc-json-control [formControl]="control" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocJsonControlComponent, ReactiveFormsModule],
})
class JsonHostComponent {
  readonly control = new FormControl<Item[] | null | undefined>([{ x: 1 }]);
}

describeChangeDetection('NgDocJsonControlComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<JsonHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(JsonHostComponent);
    await settle(fixture);
  });

  const field = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('textarea');
  const error = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('.ng-doc-json-control-error');

  it('shows the value as JSON', () => {
    expect(field().value).toBe(JSON.stringify([{ x: 1 }], null, 2));
    expect(field().hasAttribute('aria-invalid')).toBe(false);
    expect(error()).toBeNull();
  });

  it('sets the value from JSON and keeps the text as typed', async () => {
    typeInto(field(), '[{"x": 2}, {"x": 3}]');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([{ x: 2 }, { x: 3 }]);
    // The form writes the value back; the text stays as the reader typed it.
    expect(field().value).toBe('[{"x": 2}, {"x": 3}]');
  });

  it('marks invalid JSON and keeps the last valid value', async () => {
    typeInto(field(), '[{"x": 2}]');
    await settle(fixture);
    typeInto(field(), '[{"x": 2},');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([{ x: 2 }]);
    expect(field().value).toBe('[{"x": 2},');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(error()?.textContent?.trim()).toBe('Invalid JSON');
    expect(field().getAttribute('aria-describedby')).toBe(error()?.id);

    typeInto(field(), '[{"x": 2}, {"x": 4}]');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual([{ x: 2 }, { x: 4 }]);
    expect(field().hasAttribute('aria-invalid')).toBe(false);
    expect(error()).toBeNull();
  });

  it('reads an empty field as undefined, and null as null', async () => {
    typeInto(field(), '  ');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toBeUndefined();
    expect(field().hasAttribute('aria-invalid')).toBe(false);

    typeInto(field(), 'null');
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toBeNull();
  });

  it('replaces the text, valid or not, with a value from the form', async () => {
    typeInto(field(), '[oops');
    await settle(fixture);

    fixture.componentInstance.control.setValue([{ x: 9 }]);
    await settle(fixture);

    expect(field().value).toBe(JSON.stringify([{ x: 9 }], null, 2));
    expect(field().hasAttribute('aria-invalid')).toBe(false);

    fixture.componentInstance.control.setValue(undefined);
    await settle(fixture);

    expect(field().value).toBe('');
  });

  it('round-trips the value it shows', async () => {
    const value: Item[] = [{ x: 1 }, { x: 2 }];

    fixture.componentInstance.control.setValue(value);
    await settle(fixture);
    typeInto(field(), field().value);
    await settle(fixture);

    expect(fixture.componentInstance.control.value).toEqual(value);
  });
});

describeChangeDetection('The texts of the array controls', ({ providers }: ChangeDetectionCase) => {
  it('come from provideNgDocTexts', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNgDocTexts({
          playground: {
            addItem: 'Element hinzufügen',
            moveUp: 'Nach oben',
            moveDown: 'Nach unten',
            removeItem: 'Entfernen',
            item: ({ index }: { index: number }) => `Element ${index}`,
            reset: 'Zurücksetzen',
            resetToDefault: 'Auf den Standardwert zurücksetzen',
            invalidJson: 'Ungültiges JSON',
          },
        }),
      ],
    });
    const list = TestBed.createComponent(StringListHostComponent);

    list.componentInstance.default.set(undefined);
    await settle(list);
    const host: HTMLElement = list.nativeElement;
    const label = (selector: string): string | null =>
      host.querySelector(selector)?.getAttribute('aria-label') ?? null;

    expect(label('[data-ng-doc-list-input]')).toBe('Element 1');
    expect(label('[data-ng-doc-list-up]')).toBe('Nach oben');
    expect(label('[data-ng-doc-list-down]')).toBe('Nach unten');
    expect(label('[data-ng-doc-list-remove]')).toBe('Entfernen');
    expect(host.querySelector('[data-ng-doc-list-add]')?.textContent?.trim()).toBe(
      'Element hinzufügen',
    );
    expect(label('[data-ng-doc-list-reset]')).toBe('Auf den Standardwert zurücksetzen');
    expect(host.querySelector('[data-ng-doc-list-reset]')?.textContent?.trim()).toBe(
      'Zurücksetzen',
    );

    const json = TestBed.createComponent(JsonHostComponent);

    await settle(json);
    const field: HTMLTextAreaElement = json.nativeElement.querySelector('textarea');

    typeInto(field, '[');
    await settle(json);
    expect(
      json.nativeElement.querySelector('.ng-doc-json-control-error')?.textContent?.trim(),
    ).toBe('Ungültiges JSON');
  });
});
