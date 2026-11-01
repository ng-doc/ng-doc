import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgDocResolvedPlaygroundOption, resolvePlaygroundOption } from '@ng-doc/app/helpers';
import { NgDocPlaygroundTexts, NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NgDocPlaygroundOption } from '@ng-doc/core/interfaces';
import {
  NgDocButtonIconComponent,
  NgDocDropdownComponent,
  NgDocDropdownOriginDirective,
  NgDocIconComponent,
  NgDocTagComponent,
} from '@ng-doc/ui-kit';
import { DIControl } from 'di-controls';

/** A value that an item of an array control can be. */
type NgDocListControlItem = string | number | boolean;

/** A row of the dropdown of an array control. */
interface NgDocListControlRow<T> {
  /** `add` for the row that adds the typed text, `item` for a suggestion or a value of a union. */
  kind: 'add' | 'item';
  /** The value that the row adds. */
  value: T;
  /** The text of the value. */
  label: string;
  /** Whether the array holds the value: a picked value of a union. */
  selected: boolean;
}

/** A pointer that is on a chip, and drags it once it has moved far enough. */
interface NgDocListControlDrag {
  pointerId: number;
  x: number;
  y: number;
  /** The position of the item when the pointer went down. */
  index: number;
  started: boolean;
}

/** How far, in pixels, a pointer moves on a chip before it drags the chip. */
const DRAG_THRESHOLD: number = 4;

let nextId = 0;

/**
 * The base of the playground controls of array inputs: a chip combobox. The items are chips, in
 * one field with a text field after them. Enter adds the typed value, Backspace in the empty field
 * removes the last chip, and the × of a chip removes it. A chip is dragged to another place, or
 * moved with Alt+Left and Alt+Right while it is focused, and the arrow keys move between chips.
 * While the reader types, a dropdown lists the matching suggestions; the arrow keys move its
 * highlight, and Enter or a click picks a row. Escape closes it.
 *
 * Subclasses decide what an item is: typed text (`parseItem`) for the arrays of strings and
 * numbers, which suggest the input's default items and the items removed while the control is
 * shown, or the values of a union, which the dropdown lists (`NgDocTypeAliasListControlComponent`).
 *
 * The control never changes an array it received: every edit reports a new array of plain values,
 * so the value can be compared with the default and sent to an isolated demo as it is. An
 * `undefined` or `null` value has no items and shows as such; the first added item makes it an
 * array, and removing the last item leaves an empty array. Reset returns to the input's default,
 * which is how an optional input gets back to `undefined`.
 */
@Directive({
  host: {
    '(focusout)': 'leave($event)',
  },
})
export abstract class NgDocListControl<T extends NgDocListControlItem>
  extends DIControl<T[] | undefined>
  implements NgDocTypeControl<T[] | undefined>
{
  /** Default value of the input; Reset returns to it. */
  readonly default = input<T[] | undefined>(undefined);

  /**
   * Whether typed text becomes an item (`parseItem`). Without it, the dropdown lists the values the
   * items can have, and a value is in the array at most once.
   */
  protected abstract readonly freeText: boolean;

  protected readonly texts: NgDocPlaygroundTexts = inject(NG_DOC_TEXTS).playground;

  /** The prefix of the IDs of the parts of the control. */
  protected readonly id: string = `ng-doc-list-control-${nextId++}`;

  /** The items of the value; none when the value is not an array. */
  protected readonly items: Signal<readonly T[]> = computed(() => {
    const value: T[] | null | undefined = this.model();

    return Array.isArray(value) ? value : [];
  });

  /** The items as the chips show them: in the order of a drag in progress. */
  protected readonly shownItems: Signal<readonly T[]> = computed(
    () => this.dragOrder() ?? this.items(),
  );

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

  /** The text of the text field. */
  protected readonly text = signal<string>('');

  /** Whether the reader asked for the dropdown, by typing, clicking or an arrow key. */
  protected readonly expanded = signal<boolean>(false);

  /** The position of the highlighted row of the dropdown, or `-1`. */
  protected readonly highlighted = signal<number>(-1);

  /** The position of the item edited in place, or `null`. */
  protected readonly editing = signal<number | null>(null);

  /** The text of the field that edits an item in place. */
  protected readonly editText = signal<string>('');

  /** The position of the chip in the tab order; the others are reached with the arrow keys. */
  protected readonly tabStop = signal<number>(0);

  /** The position of the chip being dragged, or `null`. */
  protected readonly dragIndex = signal<number | null>(null);

  /** What the live region announces: the new position of a moved item. */
  protected readonly announcement = signal<string>('');

  /** The width of the dropdown: the width of the field. */
  protected readonly panelWidth = signal<number>(0);

  /** Whether the text field holds text that is not an item, such as a word in a `number[]`. */
  protected readonly invalid: Signal<boolean> = computed(
    () => this.freeText && this.text().trim() !== '' && this.parseItem(this.text()) === undefined,
  );

  /** Whether the field that edits an item holds text that is not an item. */
  protected readonly editInvalid: Signal<boolean> = computed(
    () => this.editing() !== null && this.parseItem(this.editText()) === undefined,
  );

  /**
   * The rows of the dropdown: the values of `candidates()` whose text contains the typed text (the
   * one equal to it first), and, when the typed text is an item that no row adds, a row that adds
   * it, first.
   */
  protected readonly rows: Signal<Array<NgDocListControlRow<T>>> = computed(() => {
    const text: string = this.text();
    const query: string = text.trim().toLowerCase();
    const items: readonly T[] = this.items();
    const typed: T | undefined = this.freeText && query ? this.parseItem(text) : undefined;
    const rows: Array<NgDocListControlRow<T>> = this.candidates()
      .map((value: T) => ({
        kind: 'item' as const,
        value,
        label: this.labelOf(value),
        selected: items.some((item: T) => Object.is(item, value)),
      }))
      .filter((row: NgDocListControlRow<T>) => row.label.toLowerCase().includes(query));
    const exact: number =
      typed === undefined
        ? -1
        : rows.findIndex((row: NgDocListControlRow<T>) => Object.is(row.value, typed));

    if (exact > 0) {
      rows.unshift(...rows.splice(exact, 1));
    }

    return typed !== undefined && exact < 0
      ? [{ kind: 'add', value: typed, label: this.labelOf(typed), selected: false }, ...rows]
      : rows;
  });

  /**
   * Whether the dropdown is open: the reader asked for it and it has rows, or, for a union, says
   * that no value matches the typed text.
   */
  protected readonly panelOpen: Signal<boolean> = computed(
    () =>
      this.expanded() &&
      !this.disabled &&
      (this.rows().length > 0 || (!this.freeText && this.text().trim() !== '')),
  );

  /** The items removed while the control is shown, which the arrays of strings and numbers suggest. */
  private readonly removed = signal<readonly T[]>([]);

  private readonly injector = inject(Injector);
  private readonly dropdown = viewChild(NgDocDropdownComponent);
  private readonly fieldBox = viewChild<ElementRef<HTMLElement>>('fieldBox');

  /** The items in the order of a drag in progress, or `null`. */
  private readonly dragOrder = signal<T[] | null>(null);
  private drag: NgDocListControlDrag | null = null;

  /** The last array the control reported, which the form writes back. */
  private reported: T[] | undefined | null = null;

  protected constructor() {
    super({
      // The form writes back each value the control reports. Another value, such as the
      // inspector's Reset, ends an edit or a drag of the items that it replaces.
      onIncomingUpdate: (value: T[] | undefined | null) => {
        if (value !== this.reported) {
          this.editing.set(null);
          this.cancelDrag();
        }
      },
    });

    // The dropdown is an overlay; it follows the state, and it closes itself on an outside click.
    effect(() => {
      const open: boolean = this.panelOpen();
      const dropdown: NgDocDropdownComponent | undefined = this.dropdown();

      untracked(() => {
        if (open) {
          this.panelWidth.set(this.fieldBox()?.nativeElement.offsetWidth ?? 0);
          dropdown?.open();
        } else {
          dropdown?.close();
        }
      });
    });
  }

  /**
   * Reads typed text as an item.
   * @param text - The text.
   * @returns The item, or `undefined` when the text is not one.
   */
  protected abstract parseItem(text: string): T | undefined;

  /**
   * The values that the dropdown can list, before the typed text filters them: for an array of
   * strings or numbers, the items of the default and the removed items that the array doesn't
   * hold. Plain arrays may hold an item twice, so typed text that is an item is added again, but
   * the suggestions never repeat an item.
   */
  protected candidates(): readonly T[] {
    const items: readonly T[] = this.items();
    const pool: T[] = [...(this.default() ?? []), ...this.removed()];

    return pool.filter(
      (value: T, index: number) =>
        pool.findIndex((other: T) => Object.is(other, value)) === index &&
        !items.some((item: T) => Object.is(item, value)),
    );
  }

  /**
   * The text of an item.
   * @param item - The item.
   */
  protected labelOf(item: T): string {
    return String(item);
  }

  /**
   * The text of a chip: the item's text, or `""` for an empty string.
   * @param item - The item.
   */
  protected chipText(item: T): string {
    return this.labelOf(item) || '""';
  }

  /**
   * Reads the text field as the reader types.
   * @param text - The text of the field.
   */
  protected type(text: string): void {
    this.text.set(text);
    this.expanded.set(true);
    // With text, the first row is the typed value or the value that matches it best.
    this.highlighted.set(text.trim() && this.rows().length ? 0 : -1);
  }

  /**
   * Handles the keys of the text field.
   * @param event - The key event.
   * @param field - The text field.
   */
  protected fieldKeydown(event: KeyboardEvent, field: HTMLInputElement): void {
    const count: number = this.items().length;

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.enter();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Escape':
        if (this.panelOpen()) {
          // The dropdown closes; the key does not reach the page.
          event.preventDefault();
          event.stopPropagation();
          this.expanded.set(false);
        }
        break;
      case 'Backspace':
        if (field.value === '' && count) {
          event.preventDefault();
          this.remove(count - 1);
        }
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // The key toward the chips, at the start of the field, focuses the last chip.
        if (
          event.key === (this.isRtl() ? 'ArrowRight' : 'ArrowLeft') &&
          field.selectionStart === 0 &&
          field.selectionEnd === 0 &&
          count
        ) {
          event.preventDefault();
          this.expanded.set(false);
          this.focusChip(count - 1);
        }
        break;
      case 'Tab':
        this.expanded.set(false);
        break;
    }
  }

  /**
   * Opens the dropdown when the reader clicks the field, and focuses the text field when the click
   * is not on a chip or a button.
   * @param event - The click.
   * @param field - The text field.
   */
  protected fieldClick(event: MouseEvent, field: HTMLInputElement): void {
    const target: Element | null = event.target instanceof Element ? event.target : null;

    if (this.disabled || target?.closest('[data-ng-doc-list-item], button')) {
      return;
    }

    field.focus();
    this.expanded.set(true);
  }

  /**
   * Picks a row of the dropdown: adds its value, or removes a picked value of a union.
   * @param row - The row.
   */
  protected pick(row: NgDocListControlRow<T>): void {
    if (!this.freeText && row.selected) {
      this.remove(
        this.items().findIndex((item: T) => Object.is(item, row.value)),
        false,
      );
    } else {
      this.add(row.value);
    }

    this.text.set('');

    if (this.freeText) {
      this.expanded.set(false);
      this.highlighted.set(-1);
    } else {
      // A union keeps its values open, so that the reader can pick several; the highlight stays on
      // the picked value.
      this.highlighted.set(
        this.rows().findIndex((other: NgDocListControlRow<T>) => Object.is(other.value, row.value)),
      );
    }
  }

  /**
   * Handles the keys of a focused chip.
   * @param event - The key event.
   * @param index - The position of the chip.
   */
  protected chipKeydown(event: KeyboardEvent, index: number): void {
    const count: number = this.items().length;
    const forward: string = this.isRtl() ? 'ArrowLeft' : 'ArrowRight';

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const offset: -1 | 1 = event.key === forward ? 1 : -1;

        event.preventDefault();

        if (event.altKey) {
          this.move(index, offset);
        } else if (index + offset >= count) {
          this.focusField();
        } else {
          this.focusChip(Math.max(index + offset, 0));
        }
        break;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        this.focusChip(event.key === 'Home' ? 0 : count - 1);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.remove(index);
        break;
      case 'Enter':
      case 'F2':
        if (this.freeText) {
          event.preventDefault();
          this.startEdit(index);
        }
        break;
    }
  }

  /**
   * Removes an item. The focus goes to the chip that takes its place, the previous chip, or the
   * text field when the field had it, or no chip is left.
   * @param index - The position of the item.
   * @param focus - Whether the focus moves; a pick in the dropdown keeps it in the text field.
   */
  protected remove(index: number, focus: boolean = true): void {
    const items: readonly T[] = this.items();
    const value: T = items[index];
    const rest: T[] = items.filter((_item: T, position: number) => position !== index);
    const fromField: boolean = this.isFocused(this.fieldElement());

    if (!this.removed().some((item: T) => Object.is(item, value))) {
      this.removed.set([...this.removed(), value]);
    }

    this.report(rest);

    if (!focus) {
      return;
    }

    if (fromField || !rest.length) {
      this.focusField();
    } else {
      this.focusChip(Math.min(index, rest.length - 1));
    }
  }

  /**
   * Edits an item in place: its chip becomes a text field.
   * @param index - The position of the item.
   */
  protected startEdit(index: number): void {
    if (!this.freeText || this.disabled) {
      return;
    }

    this.expanded.set(false);
    this.editText.set(String(this.items()[index]));
    this.editing.set(index);

    afterNextRender(
      () => {
        const field: HTMLInputElement | null = this.host().querySelector('[data-ng-doc-list-edit]');

        field?.focus();
        field?.select();
      },
      { injector: this.injector },
    );
  }

  /**
   * Handles the keys of the field that edits an item: Enter keeps the text, Escape the item.
   * @param event - The key event.
   */
  protected editKeydown(event: KeyboardEvent): void {
    const index: number | null = this.editing();

    if (index === null) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (this.commitEdit()) {
        this.focusChip(index);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.editing.set(null);
      this.focusChip(index);
    }
  }

  /** Ends an edit when its field loses the focus: with the text when it is an item. */
  protected editBlur(): void {
    if (this.editing() !== null && !this.commitEdit()) {
      this.editing.set(null);
    }
  }

  /**
   * Starts to follow a pointer that went down on a chip.
   * @param event - The pointer event.
   * @param index - The position of the chip.
   */
  protected chipPointerDown(event: PointerEvent, index: number): void {
    if (this.disabled || event.button !== 0 || this.editing() !== null) {
      return;
    }

    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      index,
      started: false,
    };
    // The chip keeps the pointer while it moves over the other chips.
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  /**
   * Drags the chip once the pointer has moved far enough, and moves it in front of or behind the
   * chip under the pointer once the pointer passes that chip's middle.
   * @param event - The pointer event.
   */
  protected chipPointerMove(event: PointerEvent): void {
    const drag: NgDocListControlDrag | null = this.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) {
        return;
      }

      drag.started = true;
      this.expanded.set(false);
      this.dragOrder.set([...this.items()]);
      this.dragIndex.set(drag.index);
    }

    const from: number | null = this.dragIndex();
    const order: T[] | null = this.dragOrder();
    const target: number | null = from === null ? null : this.dropTarget(event, from);

    if (from !== null && order && target !== null) {
      this.dragOrder.set(moveItem(order, from, target));
      this.dragIndex.set(target);
    }
  }

  /**
   * Drops a dragged chip: the items take the order of the drag.
   * @param event - The pointer event.
   */
  protected chipPointerUp(event: PointerEvent): void {
    const drag: NgDocListControlDrag | null = this.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const order: T[] | null = this.dragOrder();
    const index: number | null = this.dragIndex();

    this.cancelDrag();

    if (drag.started && order && index !== null && index !== drag.index) {
      this.report(order);
      this.announceMove(order, index);
      this.focusChip(index);
    }
  }

  /** Stops following the pointer; a drag in progress leaves the items as they were. */
  protected cancelDrag(): void {
    this.drag = null;
    this.dragOrder.set(null);
    this.dragIndex.set(null);
  }

  /**
   * Closes the dropdown and marks the control as touched when the focus leaves the control.
   * @param event - The focus event.
   */
  protected leave(event: FocusEvent): void {
    const next: Node | null = event.relatedTarget instanceof Node ? event.relatedTarget : null;

    if (!next || !this.host().contains(next)) {
      this.expanded.set(false);
      this.touch();
    }
  }

  /** Sets the value back to the default of the input. */
  protected reset(): void {
    const value: T[] | undefined = this.default();

    this.text.set('');
    this.editing.set(null);
    this.report(Array.isArray(value) ? [...value] : value);
  }

  /**
   * The ID of a row of the dropdown, which the text field names as its active descendant.
   * @param index - The position of the row.
   */
  protected rowId(index: number): string {
    return `${this.id}-row-${index}`;
  }

  /**
   * Adds an item at the end.
   * @param value - The item.
   */
  private add(value: T): void {
    this.report([...this.items(), value]);
  }

  /** Adds the highlighted row, or the typed text when it is an item. */
  private enter(): void {
    const rows: Array<NgDocListControlRow<T>> = this.rows();
    const row: NgDocListControlRow<T> | undefined = this.panelOpen()
      ? rows[this.highlighted()]
      : undefined;

    if (row) {
      this.pick(row);

      return;
    }

    const typed: T | undefined =
      this.freeText && this.text().trim() ? this.parseItem(this.text()) : undefined;

    if (typed !== undefined) {
      this.add(typed);
      this.text.set('');
      this.expanded.set(false);
    }
  }

  /**
   * Moves the highlight of the dropdown, and opens it.
   * @param step - `1` for the next row, `-1` for the previous one.
   */
  private moveHighlight(step: 1 | -1): void {
    const count: number = this.rows().length;
    const current: number = this.panelOpen() ? this.highlighted() : -1;

    this.expanded.set(true);

    if (count) {
      this.highlighted.set(
        current < 0 ? (step > 0 ? 0 : count - 1) : (current + step + count) % count,
      );
    }
  }

  /**
   * Moves an item one place, with the focus.
   * @param index - The position of the item.
   * @param offset - `-1` toward the start, `1` toward the end.
   */
  private move(index: number, offset: -1 | 1): void {
    const target: number = index + offset;
    const items: readonly T[] = this.items();

    if (target < 0 || target >= items.length) {
      return;
    }

    const order: T[] = moveItem(items, index, target);

    this.report(order);
    this.announceMove(order, target);
    this.focusChip(target);
  }

  /**
   * Sets the edited item from the text of its field.
   * @returns Whether the text is an item.
   */
  private commitEdit(): boolean {
    const index: number | null = this.editing();
    const value: T | undefined = this.parseItem(this.editText());

    if (index === null || value === undefined) {
      return false;
    }

    this.editing.set(null);

    if (!Object.is(value, this.items()[index])) {
      this.report(
        this.items().map((item: T, position: number) => (position === index ? value : item)),
      );
    }

    return true;
  }

  /**
   * The position a dragged chip moves to: the position of the chip under the pointer, once the
   * pointer has passed its middle in the direction of the move.
   * @param event - The pointer event.
   * @param from - The position of the dragged chip.
   */
  private dropTarget(event: PointerEvent, from: number): number | null {
    const rtl: boolean = this.isRtl();

    for (const chip of Array.from(
      this.host().querySelectorAll<HTMLElement>('[data-ng-doc-list-item]'),
    )) {
      const index: number = Number(chip.getAttribute('data-ng-doc-list-item'));
      const rect: DOMRect = chip.getBoundingClientRect();

      if (
        index === from ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        continue;
      }

      const middle: number = rect.left + rect.width / 2;
      const pastMiddle: boolean =
        index > from !== rtl ? event.clientX > middle : event.clientX < middle;

      return pastMiddle ? index : null;
    }

    return null;
  }

  /**
   * Reports a new value.
   * @param value - The value.
   */
  private report(value: T[] | undefined): void {
    this.reported = value;
    this.updateModel(value);
  }

  /**
   * Announces the new position of a moved item.
   * @param order - The items after the move.
   * @param index - The new position of the item.
   */
  private announceMove(order: readonly T[], index: number): void {
    this.announcement.set(
      this.texts.itemMoved({
        item: this.chipText(order[index]),
        position: index + 1,
        count: order.length,
      }),
    );
  }

  /**
   * Focuses a chip once the chips have rendered: they are tracked by position, so the focused
   * element may show another item, or be gone.
   * @param index - The position of the chip.
   */
  private focusChip(index: number): void {
    this.tabStop.set(index);
    afterNextRender(
      () =>
        this.host()
          .querySelector<HTMLElement>(`[data-ng-doc-list-item="${index}"] [data-ng-doc-list-chip]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  /** Focuses the text field once the chips have rendered. */
  private focusField(): void {
    afterNextRender(() => this.fieldElement()?.focus(), { injector: this.injector });
  }

  private fieldElement(): HTMLInputElement | null {
    return this.host().querySelector('[data-ng-doc-list-field]');
  }

  private isFocused(element: Element | null): boolean {
    return !!element && element.ownerDocument.activeElement === element;
  }

  /** Whether the chips flow from right to left, which turns the arrow keys round. */
  private isRtl(): boolean {
    const host: HTMLElement = this.host();

    return host.ownerDocument.defaultView?.getComputedStyle(host).direction === 'rtl';
  }

  private host(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}

/** The shared metadata of the array controls. */
const LIST_CONTROL_IMPORTS = [
  NgDocButtonIconComponent,
  NgDocDropdownComponent,
  NgDocDropdownOriginDirective,
  NgDocIconComponent,
  NgDocTagComponent,
];

/**
 * The playground control of `string[]` inputs: a chip combobox (`NgDocListControl`). Typed text is
 * an item as it is, and a double click, Enter or F2 edits a chip in place.
 */
@Component({
  selector: 'ng-doc-string-list-control',
  templateUrl: './list-control.component.html',
  styleUrls: ['./list-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: LIST_CONTROL_IMPORTS,
})
export class NgDocStringListControlComponent extends NgDocListControl<string> {
  protected readonly freeText = true;

  constructor() {
    super();
  }

  protected parseItem(text: string): string {
    return text;
  }
}

/**
 * The playground control of `number[]` inputs: a chip combobox (`NgDocListControl`) whose items are
 * numbers. Text that is not a number marks the field as invalid and adds nothing; a chip edited to
 * such text keeps its number.
 */
@Component({
  selector: 'ng-doc-number-list-control',
  templateUrl: './list-control.component.html',
  styleUrls: ['./list-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: LIST_CONTROL_IMPORTS,
})
export class NgDocNumberListControlComponent extends NgDocListControl<number> {
  protected readonly freeText = true;

  constructor() {
    super();
  }

  protected parseItem(text: string): number | undefined {
    const value: number = Number(text);

    return text.trim() !== '' && Number.isFinite(value) ? value : undefined;
  }
}

/**
 * The playground control of arrays of a union of literals, such as `NgDocSize[]` or
 * `('a' | 'b')[]`: a chip combobox (`NgDocListControl`) whose dropdown lists every value of the
 * union, with the same texts as the control of the union (`NgDocTypeAliasControlComponent`).
 * Picking a value adds it, and picking a value that the array holds, which is marked, removes it.
 * The typed text filters the values; it is never an item itself.
 */
@Component({
  selector: 'ng-doc-type-alias-list-control',
  templateUrl: './list-control.component.html',
  styleUrls: ['./list-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: LIST_CONTROL_IMPORTS,
})
export class NgDocTypeAliasListControlComponent extends NgDocListControl<NgDocListControlItem> {
  /**
   * The values of the items: the members of the union as written in code, plain values when
   * `isManual` is set, or the names and values of enum members.
   */
  readonly options = input<Array<string | NgDocPlaygroundOption> | undefined>(undefined);

  /** Whether `options` are values the user listed in the playground config. */
  readonly isManual = input<boolean | undefined>(undefined);

  protected readonly freeText = false;

  /** The values of the union that an item can be; `undefined`, `null` and repeats are left out. */
  protected readonly values: Signal<NgDocResolvedPlaygroundOption[]> = computed(() => {
    const isManual: boolean | undefined = this.isManual();
    const values: NgDocResolvedPlaygroundOption[] = [];

    for (const option of this.options() ?? []) {
      try {
        const value: NgDocResolvedPlaygroundOption = resolvePlaygroundOption(option, isManual);

        if (
          isListItem(value.value) &&
          !values.some((other: NgDocResolvedPlaygroundOption) =>
            Object.is(other.value, value.value),
          )
        ) {
          values.push(value);
        }
      } catch {
        // A member that is not a value, such as a type, is not offered.
      }
    }

    return values;
  });

  constructor() {
    super();
  }

  protected override candidates(): readonly NgDocListControlItem[] {
    return this.values().map(
      (option: NgDocResolvedPlaygroundOption) => option.value as NgDocListControlItem,
    );
  }

  protected override labelOf(item: NgDocListControlItem): string {
    return (
      this.values().find((option: NgDocResolvedPlaygroundOption) => Object.is(option.value, item))
        ?.label ?? String(item)
    );
  }

  protected parseItem(): undefined {
    return undefined;
  }
}

/**
 * Whether a value can be an item of an array control.
 * @param value - The value.
 */
function isListItem(value: unknown): value is NgDocListControlItem {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * The items with one of them moved to another position.
 * @param items - The items.
 * @param from - The position of the item.
 * @param to - Its new position.
 */
function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const order: T[] = [...items];
  const [item] = order.splice(from, 1);

  order.splice(to, 0, item);

  return order;
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
