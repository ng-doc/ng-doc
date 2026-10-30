import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  Injector,
  input,
  Signal,
  signal,
} from '@angular/core';
import { NgDocPlaygroundTexts, NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import {
  NgDocButtonComponent,
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocInputWrapperComponent,
} from '@ng-doc/ui-kit';
import { DIControl, DIControlSilencerDirective } from 'di-controls';

/** The part of an item row that gets the focus after the list changes. */
type NgDocListControlFocusTarget = 'input' | 'up' | 'down' | 'remove' | 'add';

/**
 * The base of the playground controls of `string[]` and `number[]` inputs: a field per item, with
 * buttons that move the item up or down and remove it, and a button that adds an item.
 *
 * The control never changes an array it received: every edit reports a new array of plain values,
 * so the value can be compared with the default and sent to an isolated demo as it is. An
 * `undefined` or `null` value has no items and shows as such; the first added item makes it an
 * array, and removing the last item leaves an empty array. Reset returns to the input's default,
 * which is how an optional input gets back to `undefined`.
 */
@Directive()
export abstract class NgDocListControl<T extends string | number>
  extends DIControl<T[] | undefined>
  implements NgDocTypeControl<T[] | undefined>
{
  /** Default value of the input; Reset returns to it. */
  readonly default = input<T[] | undefined>(undefined);

  /** The `type` of the fields of the items. */
  protected abstract readonly inputType: 'text' | 'number';

  /** The items of the value; none when the value is not an array. */
  protected readonly items: Signal<readonly T[]> = computed(() => {
    const value: T[] | null | undefined = this.model();

    return Array.isArray(value) ? value : [];
  });

  /**
   * The text shown instead of the items when the value is not an array (`undefined` or `null`), or
   * is an empty array (`[]`), so that the two can be told apart. These are code, not words.
   */
  protected readonly literal: Signal<string> = computed(() => {
    const value: T[] | null | undefined = this.model();

    if (Array.isArray(value)) {
      return value.length ? '' : '[]';
    }

    return value === null ? 'null' : 'undefined';
  });

  /** Whether Reset is shown: the value differs from the default. */
  protected readonly canReset: Signal<boolean> = computed(
    () => !sameItems(this.model(), this.default()),
  );

  /** The positions of the fields whose text is not an item, such as an empty number field. */
  protected readonly invalid = signal<ReadonlySet<number>>(new Set());

  protected readonly texts: NgDocPlaygroundTexts = inject(NG_DOC_TEXTS).playground;

  private readonly injector = inject(Injector);

  protected constructor() {
    super({
      // A new value from the form replaces the items, so no field keeps the text it had.
      onIncomingUpdate: () => this.invalid.set(new Set()),
    });
  }

  /**
   * Reads the text of a field as an item.
   * @param text - The text of the field.
   * @returns The item, or `undefined` when the text is not one.
   */
  protected abstract parseItem(text: string): T | undefined;

  /** The item that a new row starts with. */
  protected abstract emptyItem(): T;

  /** Adds an item at the end and focuses its field. */
  protected add(): void {
    this.replaceItems([...this.items(), this.emptyItem()], this.items().length, 'input');
  }

  /**
   * Removes an item, and focuses the field of the item that takes its place, or the Add button
   * when the list is empty.
   * @param index - The position of the item.
   */
  protected remove(index: number): void {
    const items: T[] = this.items().filter((_item: T, position: number) => position !== index);

    this.replaceItems(items, Math.min(index, items.length - 1), items.length ? 'input' : 'add');
  }

  /**
   * Swaps an item with the one above (`-1`) or below (`1`) it. The focus follows the item, to the
   * same button while the item can still move that way, so that the button can be pressed again.
   * @param index - The position of the item.
   * @param offset - `-1` to move it up, `1` to move it down.
   */
  protected move(index: number, offset: -1 | 1): void {
    const target: number = index + offset;
    const items: T[] = [...this.items()];

    if (target < 0 || target >= items.length) {
      return;
    }

    [items[index], items[target]] = [items[target], items[index]];

    const edge: boolean = offset < 0 ? target === 0 : target === items.length - 1;
    const button: NgDocListControlFocusTarget =
      offset < 0 ? (edge ? 'down' : 'up') : edge ? 'up' : 'down';

    this.replaceItems(items, target, items.length > 1 ? button : 'input');
  }

  /**
   * Sets an item from the text of its field. Text that is not an item, such as an empty number
   * field, marks the field as invalid and leaves the value as it is.
   * @param index - The position of the item.
   * @param text - The text of the field.
   */
  protected edit(index: number, text: string): void {
    const item: T | undefined = this.parseItem(text);

    if (item === undefined) {
      this.setInvalid(index, true);

      return;
    }

    this.setInvalid(index, false);
    this.updateModel(
      this.items().map((value: T, position: number) => (position === index ? item : value)),
    );
  }

  /**
   * Shows the item again in a field left with text that is not one, when the field loses focus.
   * @param index - The position of the item.
   * @param field - The field.
   */
  protected commit(index: number, field: HTMLInputElement): void {
    if (this.invalid().has(index)) {
      field.value = String(this.items()[index] ?? '');
      this.setInvalid(index, false);
    }

    this.touch();
  }

  /** Sets the value back to the default of the input. */
  protected reset(): void {
    const value: T[] | undefined = this.default();

    this.invalid.set(new Set());
    this.updateModel(Array.isArray(value) ? [...value] : value);
  }

  private replaceItems(items: T[], focusIndex: number, focus: NgDocListControlFocusTarget): void {
    this.invalid.set(new Set());
    this.updateModel(items);

    // The rows are tracked by position, so the focused element now shows another item, or is
    // gone: the focus is moved to the row of the item once the list has rendered.
    afterNextRender(
      () => {
        const host: HTMLElement = this.elementRef.nativeElement;
        const selector: string =
          focus === 'add'
            ? '[data-ng-doc-list-add]'
            : `[data-ng-doc-list-item="${focusIndex}"] [data-ng-doc-list-${focus}]`;

        host.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector },
    );
  }

  private setInvalid(index: number, invalid: boolean): void {
    if (this.invalid().has(index) === invalid) {
      return;
    }

    const positions = new Set<number>(this.invalid());

    if (invalid) {
      positions.add(index);
    } else {
      positions.delete(index);
    }

    this.invalid.set(positions);
  }
}

/** The shared metadata of the list controls. */
const LIST_CONTROL_IMPORTS = [
  NgDocInputWrapperComponent,
  DIControlSilencerDirective,
  NgDocButtonComponent,
  NgDocButtonIconComponent,
  NgDocIconComponent,
];

/**
 * The playground control of `string[]` inputs: a text field per item, which can be added, removed
 * and reordered.
 */
@Component({
  selector: 'ng-doc-string-list-control',
  templateUrl: './list-control.component.html',
  styleUrls: ['./list-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: LIST_CONTROL_IMPORTS,
})
export class NgDocStringListControlComponent extends NgDocListControl<string> {
  protected readonly inputType = 'text';

  constructor() {
    super();
  }

  protected parseItem(text: string): string {
    return text;
  }

  protected emptyItem(): string {
    return '';
  }
}

/**
 * The playground control of `number[]` inputs: a number field per item, which can be added,
 * removed and reordered. The items are numbers; a field without a number, such as an empty one, is
 * marked as invalid and keeps the previous number of the item.
 */
@Component({
  selector: 'ng-doc-number-list-control',
  templateUrl: './list-control.component.html',
  styleUrls: ['./list-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: LIST_CONTROL_IMPORTS,
})
export class NgDocNumberListControlComponent extends NgDocListControl<number> {
  protected readonly inputType = 'number';

  constructor() {
    super();
  }

  protected parseItem(text: string): number | undefined {
    const value: number = Number(text);

    return text.trim() !== '' && Number.isFinite(value) ? value : undefined;
  }

  protected emptyItem(): number {
    return 0;
  }
}

/**
 * Whether two values of a list control hold the same items in the same order. `undefined` and
 * `null` are values of their own.
 * @param a - The first value.
 * @param b - The second value.
 */
function sameItems(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item: unknown, index: number) => Object.is(item, b[index]))
    );
  }

  return a === b;
}
