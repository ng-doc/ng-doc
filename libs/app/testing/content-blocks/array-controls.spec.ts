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
  NgDocTypeAliasListControlComponent,
} from '@ng-doc/app/type-controls';
import { NgDocPlaygroundOption } from '@ng-doc/core/interfaces';
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

// jsdom implements no Web Animations; tooltips and dropdowns await `animate().finished`.
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
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
};

const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, text: string): void => {
  field.value = text;
  field.dispatchEvent(new Event('input'));
};

const press = (element: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

  element.dispatchEvent(event);

  return event;
};

const pointer = (element: Element, type: string, x: number, y: number = 10): void => {
  element.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }),
  );
};

/** The parts of an array control, found from its host element. */
class ArrayControlParts {
  constructor(private readonly host: HTMLElement) {}

  get field(): HTMLInputElement {
    return this.host.querySelector('input[data-ng-doc-list-field]')!;
  }

  get box(): HTMLElement {
    return this.host.querySelector('.ng-doc-list-control-box')!;
  }

  chips(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll('[data-ng-doc-list-chip]'));
  }

  texts(): string[] {
    return this.chips().map((chip: HTMLElement) => chip.textContent?.trim() ?? '');
  }

  chip(index: number): HTMLElement {
    return this.host.querySelector(`[data-ng-doc-list-item="${index}"] [data-ng-doc-list-chip]`)!;
  }

  remove(index: number): HTMLButtonElement {
    return this.host.querySelector(`[data-ng-doc-list-item="${index}"] [data-ng-doc-list-remove]`)!;
  }

  get edit(): HTMLInputElement | null {
    return this.host.querySelector('input[data-ng-doc-list-edit]');
  }

  get reset(): HTMLButtonElement | null {
    return this.host.querySelector('[data-ng-doc-list-reset]');
  }

  get literal(): string | undefined {
    return this.host.querySelector('[data-ng-doc-list-literal]')?.textContent?.trim();
  }

  get error(): HTMLElement | null {
    return this.host.querySelector('.ng-doc-list-control-error');
  }

  get status(): string {
    return this.host.querySelector('[role="status"]')?.textContent?.trim() ?? '';
  }

  /** The listbox of the dropdown, in the overlay; `null` while the dropdown is closed. */
  get listbox(): HTMLElement | null {
    return this.host.ownerDocument.getElementById(this.field.getAttribute('aria-controls')!);
  }

  rows(): HTMLElement[] {
    return Array.from(this.listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  }

  rowTexts(): string[] {
    return this.rows().map((row: HTMLElement) => row.textContent?.trim() ?? '');
  }

  /** The text of the panel without a listbox, such as "No matches". */
  get noMatches(): string | undefined {
    return this.host.ownerDocument
      .querySelector('.ng-doc-list-control-no-matches')
      ?.textContent?.trim();
  }
}

/**
 * Lays the chips out in a row, 40px wide with 10px between them (jsdom lays out nothing).
 * @param parts - The parts of the control.
 */
function layOutChips(parts: ArrayControlParts): void {
  parts.chips().forEach((chip: HTMLElement) => {
    const item: HTMLElement = chip.closest('[data-ng-doc-list-item]')!;

    item.getBoundingClientRect = () => {
      const index: number = Number(item.getAttribute('data-ng-doc-list-item'));

      return new DOMRect(index * 50, 0, 40, 24);
    };
  });
}

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

    it('gives arrays of strings, numbers and unions chips, and other arrays the JSON field', async () => {
      const fixture = await render();
      const list = 'ng-doc-string-list-control';
      const numbers = 'ng-doc-number-list-control';
      const union = 'ng-doc-type-alias-list-control';
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
        // Without the options of its items, an array of a union keeps the JSON field.
        sizes: json,
        named: json,
        variants: union,
        optionalVariants: union,
        statuses: union,
        manualVariants: union,
        optionalItemsWithOptions: json,
        optionalPair: json,
        size: 'ng-doc-type-alias-control',
      });
      expect(
        warn.mock.calls.map(([message]: unknown[]) => /@Input "(\w+)"/.exec(String(message))?.[1]),
      ).toEqual(['factory', 'either', 'keys', 'alias']);
    });

    it('renders an array control as a group named by its caption, and the JSON field in a label', async () => {
      const fixture = await render();
      const row = (control: string): HTMLElement =>
        (fixture.nativeElement as HTMLElement)
          .querySelector(control)!
          .closest('.ng-doc-playground-property-label') as HTMLElement;

      expect(row('ng-doc-string-list-control').tagName).toBe('DIV');
      expect(row('ng-doc-string-list-control').getAttribute('role')).toBe('group');
      expect(row('ng-doc-number-list-control').tagName).toBe('DIV');
      expect(row('ng-doc-type-alias-list-control').tagName).toBe('DIV');
      expect(row('ng-doc-json-control').tagName).toBe('LABEL');
    });

    it('shows no type chip for an array, whatever its options', async () => {
      const fixture = await render();
      const chip = (name: string): string | null | undefined =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('ng-doc-playground-property'),
        )
          .find(
            (row: Element) =>
              row.querySelector('.ng-doc-playground-property-name')?.textContent?.trim() === name,
          )
          ?.querySelector('ng-doc-kind-icon')
          ?.getAttribute('data-ng-doc-kind');

      expect(chip('variants')).toBeUndefined();
      expect(chip('optionalItemsWithOptions')).toBeUndefined();
      expect(chip('size')).toBe('string');
    });
  },
);

// ---------------------------------------------------------------------------------------------
// The chip fields of strings and numbers
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
  let parts: ArrayControlParts;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(StringListHostComponent);
    parts = new ArrayControlParts(fixture.nativeElement);
    await settle(fixture);
  });

  const value = (): string[] | null | undefined => fixture.componentInstance.control.value;

  /**
   * Types text in the field and presses Enter.
   * @param text - The text.
   */
  const add = async (text: string): Promise<void> => {
    parts.field.focus();
    typeInto(parts.field, text);
    await settle(fixture);
    press(parts.field, 'Enter');
    await settle(fixture);
  };

  it('shows the items as chips before a text field, all in one box', () => {
    expect(parts.texts()).toEqual(['a', 'b', 'c']);
    expect(parts.box.contains(parts.field)).toBe(true);
    // The placeholder shows while there is no chip; the name stays.
    expect(parts.field.getAttribute('placeholder')).toBe('');
    expect(parts.field.getAttribute('aria-label')).toBe('Add item');
    expect(parts.field.getAttribute('role')).toBe('combobox');
    expect(parts.field.getAttribute('aria-expanded')).toBe('false');
    expect(parts.remove(1).getAttribute('aria-label')).toBe('Remove b');
    expect(parts.chip(0).getAttribute('role')).toBe('button');
    // One chip is in the tab order; the arrow keys reach the others.
    expect(parts.chips().map((chip: HTMLElement) => chip.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
    const hints: string[] = parts.chip(0).getAttribute('aria-describedby')!.split(' ');
    expect(
      hints.map((id: string) => fixture.nativeElement.querySelector(`[id="${id}"]`)?.textContent),
    ).toEqual(['Enter or F2 to edit', 'Alt+Left or Alt+Right to move, Delete to remove']);
    // The value is the default: nothing to reset.
    expect(parts.reset).toBeNull();
    expect(parts.literal).toBeUndefined();
  });

  it('adds the typed text with Enter and reports a new array', async () => {
    const before: string[] | null | undefined = value();

    await add('d');

    expect(value()).toEqual(['a', 'b', 'c', 'd']);
    expect(before).toEqual(['a', 'b', 'c']);
    expect(value()).not.toBe(before);
    expect(parts.field.value).toBe('');
    expect(parts.texts()).toEqual(['a', 'b', 'c', 'd']);
    expect(parts.reset?.getAttribute('aria-label')).toBe('Reset to the default value');
  });

  it('adds nothing for an empty field', async () => {
    await add('');

    expect(value()).toEqual(['a', 'b', 'c']);
  });

  it('removes the last chip with Backspace in the empty field, down to an empty array', async () => {
    parts.field.focus();

    for (const expected of [['a', 'b'], ['a'], []]) {
      press(parts.field, 'Backspace');
      await settle(fixture);
      expect(value()).toEqual(expected);
    }

    expect(parts.literal).toBe('[]');
    expect(parts.field.getAttribute('placeholder')).toBe('Add item');
    expect(document.activeElement).toBe(parts.field);

    // Not while the field has text.
    fixture.componentInstance.control.setValue(['a']);
    await settle(fixture);
    typeInto(parts.field, 'x');
    press(parts.field, 'Backspace');
    await settle(fixture);
    expect(value()).toEqual(['a']);
  });

  it('removes a chip with its ×, and focuses the chip that takes its place', async () => {
    parts.remove(1).click();
    await settle(fixture);

    expect(value()).toEqual(['a', 'c']);
    expect(parts.texts()).toEqual(['a', 'c']);
    expect(document.activeElement).toBe(parts.chip(1));

    parts.remove(1).click();
    parts.remove(0).click();
    await settle(fixture);

    expect(value()).toEqual([]);
    expect(document.activeElement).toBe(parts.field);
  });

  it('moves the focus between chips with the arrow keys, and removes one with Delete', async () => {
    parts.field.focus();
    press(parts.field, 'ArrowLeft');
    await settle(fixture);
    expect(document.activeElement).toBe(parts.chip(2));

    press(parts.chip(2), 'ArrowLeft');
    await settle(fixture);
    expect(document.activeElement).toBe(parts.chip(1));
    expect(parts.chip(1).getAttribute('tabindex')).toBe('0');

    press(parts.chip(1), 'Home');
    await settle(fixture);
    expect(document.activeElement).toBe(parts.chip(0));

    press(parts.chip(0), 'End');
    await settle(fixture);
    press(parts.chip(2), 'ArrowRight');
    await settle(fixture);
    expect(document.activeElement).toBe(parts.field);

    parts.chip(1).focus();
    press(parts.chip(1), 'Delete');
    await settle(fixture);
    expect(value()).toEqual(['a', 'c']);
    expect(document.activeElement).toBe(parts.chip(1));
  });

  it('moves a chip with Alt+Left and Alt+Right, with the focus, and announces its place', async () => {
    parts.chip(0).focus();
    press(parts.chip(0), 'ArrowRight', { altKey: true });
    await settle(fixture);

    expect(value()).toEqual(['b', 'a', 'c']);
    expect(document.activeElement).toBe(parts.chip(1));
    expect(parts.status).toBe('a: 2 of 3');

    press(parts.chip(1), 'ArrowLeft', { altKey: true });
    await settle(fixture);
    expect(value()).toEqual(['a', 'b', 'c']);

    // Not past the ends.
    press(parts.chip(0), 'ArrowLeft', { altKey: true });
    await settle(fixture);
    expect(value()).toEqual(['a', 'b', 'c']);
  });

  it('drags a chip past the middle of another to move it there', async () => {
    layOutChips(parts);

    pointer(parts.chip(0), 'pointerdown', 10);
    // Not far enough to drag.
    pointer(parts.chip(0), 'pointermove', 12);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-ng-doc-dragging="true"]')).toBeNull();

    // Over the second chip, before its middle (70): no move yet.
    pointer(parts.chip(0), 'pointermove', 60);
    await settle(fixture);
    expect(parts.texts()).toEqual(['a', 'b', 'c']);
    expect(fixture.nativeElement.querySelector('[data-ng-doc-dragging="true"]')).not.toBeNull();

    pointer(parts.chip(0), 'pointermove', 75);
    await settle(fixture);
    // The chips show the new order; the value changes on the drop.
    expect(parts.texts()).toEqual(['b', 'a', 'c']);
    expect(value()).toEqual(['a', 'b', 'c']);

    pointer(parts.chip(0), 'pointermove', 125);
    await settle(fixture);
    expect(parts.texts()).toEqual(['b', 'c', 'a']);

    pointer(parts.chip(0), 'pointerup', 125);
    await settle(fixture);
    expect(value()).toEqual(['b', 'c', 'a']);
    expect(parts.status).toBe('a: 3 of 3');
    expect(document.activeElement).toBe(parts.chip(2));

    // A cancelled drag leaves the order.
    layOutChips(parts);
    pointer(parts.chip(0), 'pointerdown', 10);
    pointer(parts.chip(0), 'pointermove', 75);
    await settle(fixture);
    expect(parts.texts()).toEqual(['c', 'b', 'a']);
    pointer(parts.chip(0), 'pointercancel', 75);
    await settle(fixture);
    expect(parts.texts()).toEqual(['b', 'c', 'a']);
    expect(value()).toEqual(['b', 'c', 'a']);
  });

  it('edits a chip in place on a double click, Enter or F2', async () => {
    parts.chip(1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    expect(parts.edit?.value).toBe('b');
    expect(parts.edit?.getAttribute('aria-label')).toBe('Edit b');
    expect(document.activeElement).toBe(parts.edit);

    typeInto(parts.edit!, 'B');
    press(parts.edit!, 'Enter');
    await settle(fixture);

    expect(value()).toEqual(['a', 'B', 'c']);
    expect(parts.edit).toBeNull();
    expect(document.activeElement).toBe(parts.chip(1));

    // Escape keeps the item.
    press(parts.chip(1), 'F2');
    await settle(fixture);
    typeInto(parts.edit!, 'zzz');
    press(parts.edit!, 'Escape');
    await settle(fixture);
    expect(value()).toEqual(['a', 'B', 'c']);

    // Leaving the field keeps the text.
    press(parts.chip(1), 'Enter');
    await settle(fixture);
    typeInto(parts.edit!, '');
    parts.edit!.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(value()).toEqual(['a', '', 'c']);
    // An empty string shows as code.
    expect(parts.texts()).toEqual(['a', '""', 'c']);
  });

  it('suggests the default items and the removed items that the array does not hold', async () => {
    const open = async (text: string): Promise<void> => {
      parts.field.focus();
      typeInto(parts.field, text);
      await settle(fixture);
    };

    // Everything suggested is in the array, and the field is empty: no dropdown.
    parts.field.click();
    await settle(fixture);
    expect(parts.listbox).toBeNull();

    parts.remove(1).click();
    parts.remove(0).click();
    await settle(fixture);
    fixture.componentInstance.default.set(['a', 'b', 'c', 'z']);
    await settle(fixture);

    parts.field.click();
    await settle(fixture);
    expect(parts.field.getAttribute('aria-expanded')).toBe('true');
    expect(parts.listbox?.getAttribute('aria-label')).toBe('Suggestions');
    expect(parts.rowTexts()).toEqual(['a', 'b', 'z']);

    // The typed text filters them, and is offered as an item when no suggestion is it.
    await open('Z');
    expect(parts.rowTexts()).toEqual(['Add “Z”', 'z']);
    await open('b');
    expect(parts.rowTexts()).toEqual(['b']);
    // Plain arrays may hold an item twice: typed text that the array holds is added again.
    await open('c');
    expect(parts.rowTexts()).toEqual(['Add “c”']);
    press(parts.field, 'Enter');
    await settle(fixture);
    expect(value()).toEqual(['c', 'c']);
    expect(parts.listbox).toBeNull();
  });

  it('moves the highlight with the arrow keys, and picks a row with Enter or a click', async () => {
    fixture.componentInstance.control.setValue([]);
    await settle(fixture);
    parts.field.focus();
    press(parts.field, 'ArrowDown');
    await settle(fixture);

    expect(parts.rowTexts()).toEqual(['a', 'b', 'c']);
    expect(parts.field.getAttribute('aria-activedescendant')).toBe(parts.rows()[0].id);

    press(parts.field, 'ArrowUp');
    await settle(fixture);
    expect(parts.field.getAttribute('aria-activedescendant')).toBe(parts.rows()[2].id);
    expect(parts.rows()[2].getAttribute('aria-selected')).toBe('true');

    press(parts.field, 'ArrowDown');
    press(parts.field, 'ArrowDown');
    await settle(fixture);
    press(parts.field, 'Enter');
    await settle(fixture);
    expect(value()).toEqual(['b']);

    parts.field.click();
    await settle(fixture);
    expect(parts.rowTexts()).toEqual(['a', 'c']);
    parts.rows()[1].click();
    await settle(fixture);
    expect(value()).toEqual(['b', 'c']);
    expect(document.activeElement).toBe(parts.field);

    // Escape closes the dropdown, and keeps the key from the page.
    press(parts.field, 'ArrowDown');
    await settle(fixture);
    const escape: KeyboardEvent = press(parts.field, 'Escape');
    await settle(fixture);
    expect(escape.defaultPrevented).toBe(true);
    expect(parts.listbox).toBeNull();
    expect(parts.field.getAttribute('aria-expanded')).toBe('false');
    expect(press(parts.field, 'Escape').defaultPrevented).toBe(false);
  });

  it('tells undefined, null and an empty array apart, and makes undefined an array', async () => {
    fixture.componentInstance.control.setValue(undefined);
    await settle(fixture);

    expect(parts.chips()).toHaveLength(0);
    expect(parts.literal).toBe('undefined');

    fixture.componentInstance.control.setValue(null);
    await settle(fixture);
    expect(parts.literal).toBe('null');

    fixture.componentInstance.control.setValue([]);
    await settle(fixture);
    expect(parts.literal).toBe('[]');

    fixture.componentInstance.control.setValue(undefined);
    await settle(fixture);
    await add('first');

    expect(value()).toEqual(['first']);
    expect(parts.literal).toBeUndefined();
  });

  it('resets to the default, including undefined for an optional input', async () => {
    parts.remove(0).click();
    await settle(fixture);

    parts.reset!.click();
    await settle(fixture);

    expect(value()).toEqual(['a', 'b', 'c']);
    // A copy: editing the value later never changes the default.
    expect(value()).not.toBe(fixture.componentInstance.default());
    expect(parts.reset).toBeNull();

    fixture.componentInstance.default.set(undefined);
    await settle(fixture);
    parts.reset!.click();
    await settle(fixture);

    expect(value()).toBeUndefined();
    expect(parts.literal).toBe('undefined');
  });

  it('marks the control as touched when the focus leaves it', async () => {
    parts.field.focus();
    parts.field.blur();
    await settle(fixture);

    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('disables every part with the form control', async () => {
    fixture.componentInstance.control.disable();
    await settle(fixture);

    expect(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input, button')).every(
        (element: Element) => (element as HTMLInputElement | HTMLButtonElement).disabled,
      ),
    ).toBe(true);
    expect(parts.chips().every((chip: HTMLElement) => !chip.hasAttribute('tabindex'))).toBe(true);

    parts.box.click();
    parts.chip(0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);
    expect(parts.listbox).toBeNull();
    expect(parts.edit).toBeNull();
  });
});

describeChangeDetection('NgDocNumberListControlComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<NumberListHostComponent>;
  let parts: ArrayControlParts;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(NumberListHostComponent);
    parts = new ArrayControlParts(fixture.nativeElement);
    await settle(fixture);
  });

  const value = (): number[] | null | undefined => fixture.componentInstance.control.value;

  it('adds numbers as numbers', async () => {
    expect(parts.texts()).toEqual(['1', '2']);

    parts.field.focus();
    typeInto(parts.field, '42.5');
    await settle(fixture);
    expect(parts.rowTexts()).toEqual(['Add “42.5”']);
    press(parts.field, 'Enter');
    await settle(fixture);

    typeInto(parts.field, '-3');
    press(parts.field, 'Enter');
    await settle(fixture);

    expect(value()).toEqual([1, 2, 42.5, -3]);
  });

  it('marks text that is not a number and adds nothing', async () => {
    parts.field.focus();
    typeInto(parts.field, 'abc');
    await settle(fixture);

    expect(parts.field.getAttribute('aria-invalid')).toBe('true');
    expect(parts.error?.textContent?.trim()).toBe('Not a number');
    expect(parts.field.getAttribute('aria-describedby')).toBe(parts.error?.id);
    expect(parts.listbox).toBeNull();

    press(parts.field, 'Enter');
    await settle(fixture);
    expect(value()).toEqual([1, 2]);

    typeInto(parts.field, '');
    await settle(fixture);
    expect(parts.field.hasAttribute('aria-invalid')).toBe(false);
    expect(parts.error).toBeNull();
  });

  it('keeps the number of a chip edited to text that is not one', async () => {
    press(parts.chip(0), 'Enter');
    await settle(fixture);
    typeInto(parts.edit!, 'x');
    await settle(fixture);

    expect(parts.edit?.getAttribute('aria-invalid')).toBe('true');
    expect(parts.error?.textContent?.trim()).toBe('Not a number');

    // Enter keeps the field open; leaving it keeps the number.
    press(parts.edit!, 'Enter');
    await settle(fixture);
    expect(parts.edit).not.toBeNull();
    parts.edit!.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(value()).toEqual([1, 2]);
    expect(parts.edit).toBeNull();

    press(parts.chip(1), 'F2');
    await settle(fixture);
    typeInto(parts.edit!, '7');
    press(parts.edit!, 'Enter');
    await settle(fixture);
    expect(value()).toEqual([1, 7]);
  });

  it('suggests a removed number again', async () => {
    parts.remove(0).click();
    await settle(fixture);
    parts.field.focus();
    typeInto(parts.field, '1');
    await settle(fixture);

    // The typed number is the suggestion: no row adds it a second time.
    expect(parts.rowTexts()).toEqual(['1']);
    press(parts.field, 'Enter');
    await settle(fixture);
    expect(value()).toEqual([2, 1]);
  });
});

// ---------------------------------------------------------------------------------------------
// The multi-select of a union
// ---------------------------------------------------------------------------------------------

@Component({
  selector: 'ng-doc-union-list-host',
  template: `<ng-doc-type-alias-list-control
    [formControl]="control"
    [default]="default()"
    [options]="options()"
    [isManual]="isManual()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTypeAliasListControlComponent, ReactiveFormsModule],
})
class UnionListHostComponent {
  readonly control = new FormControl<Array<string | number | boolean> | null | undefined>([
    'small',
  ]);
  readonly default = signal<Array<string | number | boolean> | undefined>(['small']);
  readonly options = signal<Array<string | NgDocPlaygroundOption>>([
    "'small'",
    "'medium'",
    "'large'",
    'undefined',
    'NotAValue',
  ]);
  readonly isManual = signal<boolean | undefined>(undefined);
}

describeChangeDetection(
  'NgDocTypeAliasListControlComponent',
  ({ providers }: ChangeDetectionCase) => {
    let fixture: ComponentFixture<UnionListHostComponent>;
    let parts: ArrayControlParts;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
      });
      fixture = TestBed.createComponent(UnionListHostComponent);
      parts = new ArrayControlParts(fixture.nativeElement);
      await settle(fixture);
    });

    const value = (): Array<string | number | boolean> | null | undefined =>
      fixture.componentInstance.control.value;

    it('lists every value of the union, and marks the picked ones', async () => {
      parts.field.click();
      await settle(fixture);

      // `undefined` and members that are no value are not offered.
      expect(parts.rowTexts()).toEqual(['small', 'medium', 'large']);
      expect(parts.listbox?.getAttribute('aria-multiselectable')).toBe('true');
      expect(parts.rows().map((row: HTMLElement) => row.getAttribute('aria-selected'))).toEqual([
        'true',
        'false',
        'false',
      ]);
      expect(parts.rows()[0].querySelector('ng-doc-icon[icon="check"]')).not.toBeNull();
      // The chips are not edited in place.
      expect(parts.chip(0).hasAttribute('role')).toBe(false);
      expect(parts.chip(0).getAttribute('aria-describedby')?.split(' ')).toHaveLength(1);
    });

    it('adds a picked value, keeps the dropdown open, and removes a value picked again', async () => {
      parts.field.click();
      await settle(fixture);
      parts.rows()[2].click();
      await settle(fixture);

      expect(value()).toEqual(['small', 'large']);
      expect(parts.texts()).toEqual(['small', 'large']);
      expect(parts.rowTexts()).toEqual(['small', 'medium', 'large']);

      parts.rows()[0].click();
      await settle(fixture);
      expect(value()).toEqual(['large']);
    });

    it('filters the values by the typed text, and offers no other text', async () => {
      parts.field.focus();
      typeInto(parts.field, 'ME');
      await settle(fixture);

      expect(parts.rowTexts()).toEqual(['medium']);
      press(parts.field, 'Enter');
      await settle(fixture);
      expect(value()).toEqual(['small', 'medium']);
      expect(parts.field.value).toBe('');

      typeInto(parts.field, 'huge');
      await settle(fixture);
      expect(parts.listbox).toBeNull();
      expect(parts.noMatches).toBe('No matches');
      expect(parts.field.hasAttribute('aria-invalid')).toBe(false);
      press(parts.field, 'Enter');
      await settle(fixture);
      expect(value()).toEqual(['small', 'medium']);
    });

    it('shows enum members by name and sets their values', async () => {
      fixture.componentInstance.options.set([
        { label: 'Good', value: 'good' },
        { label: 'Bad', value: 0 },
      ]);
      fixture.componentInstance.control.setValue(['good']);
      await settle(fixture);

      expect(parts.texts()).toEqual(['Good']);
      expect(parts.remove(0).getAttribute('aria-label')).toBe('Remove Good');

      parts.field.click();
      await settle(fixture);
      parts.rows()[1].click();
      await settle(fixture);
      expect(value()).toEqual(['good', 0]);
    });

    it('takes plain values from the playground configuration', async () => {
      fixture.componentInstance.options.set(['x', 'y']);
      fixture.componentInstance.isManual.set(true);
      fixture.componentInstance.control.setValue(undefined);
      await settle(fixture);

      expect(parts.literal).toBe('undefined');
      parts.field.focus();
      press(parts.field, 'ArrowDown');
      press(parts.field, 'ArrowDown');
      await settle(fixture);
      press(parts.field, 'Enter');
      await settle(fixture);
      expect(value()).toEqual(['y']);
    });

    it('moves and removes chips like the other array controls, but never edits them', async () => {
      fixture.componentInstance.control.setValue(['small', 'large']);
      await settle(fixture);

      press(parts.chip(0), 'ArrowRight', { altKey: true });
      await settle(fixture);
      expect(value()).toEqual(['large', 'small']);

      parts.chip(0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      press(parts.chip(0), 'Enter');
      await settle(fixture);
      expect(parts.edit).toBeNull();

      parts.chip(0).focus();
      press(parts.chip(0), 'Backspace');
      await settle(fixture);
      expect(value()).toEqual(['small']);
    });
  },
);

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
            addValue: ({ value }: { value: string }) => `„${value}“ hinzufügen`,
            removeItem: ({ item }: { item: string }) => `${item} entfernen`,
            editItem: ({ item }: { item: string }) => `${item} bearbeiten`,
            itemKeys: 'Alt+Pfeiltasten verschieben',
            editKeys: 'Eingabe bearbeitet',
            itemMoved: ({ item, position, count }) => `${item}: ${position} von ${count}`,
            suggestions: 'Vorschläge',
            noMatches: 'Keine Treffer',
            invalidNumber: 'Keine Zahl',
            resetToDefault: 'Auf den Standardwert zurücksetzen',
            invalidJson: 'Ungültiges JSON',
          },
        }),
      ],
    });
    const list = TestBed.createComponent(StringListHostComponent);

    list.componentInstance.default.set(['x']);
    await settle(list);
    const parts = new ArrayControlParts(list.nativeElement);
    const text = (id: string): string | undefined =>
      list.nativeElement.querySelector(`[id="${id}"]`)?.textContent;

    expect(parts.field.getAttribute('aria-label')).toBe('Element hinzufügen');
    expect(parts.remove(0).getAttribute('aria-label')).toBe('a entfernen');
    expect(parts.reset?.getAttribute('aria-label')).toBe('Auf den Standardwert zurücksetzen');
    expect(parts.chip(0).getAttribute('aria-describedby')!.split(' ').map(text)).toEqual([
      'Eingabe bearbeitet',
      'Alt+Pfeiltasten verschieben',
    ]);

    parts.field.focus();
    typeInto(parts.field, 'neu');
    await settle(list);
    expect(parts.rowTexts()).toEqual(['„neu“ hinzufügen']);
    expect(parts.listbox?.getAttribute('aria-label')).toBe('Vorschläge');

    press(parts.chip(0), 'ArrowRight', { altKey: true });
    await settle(list);
    expect(parts.status).toBe('a: 2 von 3');

    press(parts.chip(1), 'F2');
    await settle(list);
    expect(parts.edit?.getAttribute('aria-label')).toBe('a bearbeiten');

    const numbers = TestBed.createComponent(NumberListHostComponent);

    await settle(numbers);
    const numberParts = new ArrayControlParts(numbers.nativeElement);

    typeInto(numberParts.field, 'x');
    await settle(numbers);
    expect(numberParts.error?.textContent?.trim()).toBe('Keine Zahl');

    const union = TestBed.createComponent(UnionListHostComponent);

    await settle(union);
    const unionParts = new ArrayControlParts(union.nativeElement);

    unionParts.field.focus();
    typeInto(unionParts.field, 'huge');
    await settle(union);
    expect(unionParts.noMatches).toBe('Keine Treffer');

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
