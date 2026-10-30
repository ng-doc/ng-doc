import { ChangeDetectionStrategy, Component, computed, Signal, signal } from '@angular/core';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import { DIControl } from 'di-controls';

/** The value of no text yet: no value has been written to the control. */
const NOTHING: unique symbol = Symbol('NOTHING');

let nextId = 0;

/**
 * The playground control of array inputs that have no list control, such as `Item[]` or
 * `[string, number]`: a text area that holds the value as JSON.
 *
 * Text that parses sets the value; while the text is not JSON, the field is marked as invalid and
 * the input keeps its last valid value. An empty field is `undefined`, and the value that the
 * playground writes is shown as JSON again, so the text and the value always match. It edits any
 * value that JSON can hold, so it can also be registered for an object type.
 */
@Component({
  selector: 'ng-doc-json-control',
  templateUrl: './json-control.component.html',
  styleUrls: ['./json-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocJsonControlComponent<T = unknown>
  extends DIControl<T | undefined>
  implements NgDocTypeControl<T | undefined>
{
  /** The text of the field. */
  protected readonly text = signal<string>('');

  /** Whether the text is not JSON. */
  protected readonly invalid = signal<boolean>(false);

  /** The rows of the field: its lines, from 2 to 10. */
  protected readonly rows: Signal<number> = computed(() =>
    Math.min(Math.max(this.text().split('\n').length, 2), 10),
  );

  /** ID of the message that describes invalid text. */
  protected readonly errorId: string = `ng-doc-json-control-error-${nextId++}`;

  /** The value that the text stands for. */
  private textValue: T | null | undefined | typeof NOTHING = NOTHING;

  constructor() {
    super();
  }

  override writeValue(value: T | null | undefined): void {
    super.writeValue(value);

    // The form writes back each value the control reports. That value is the text already, which
    // must stay as the reader typed it (spaces, line breaks), so only another value replaces it.
    if (value !== this.textValue || this.invalid()) {
      this.textValue = value;
      this.text.set(toJson(value));
      this.invalid.set(false);
    }
  }

  /**
   * Sets the value from the text of the field, when it is JSON.
   * @param text - The text of the field.
   */
  protected edit(text: string): void {
    this.text.set(text);

    let value: T | undefined;

    try {
      value = text.trim() === '' ? undefined : (JSON.parse(text) as T);
    } catch {
      this.invalid.set(true);

      return;
    }

    this.invalid.set(false);
    this.textValue = value;
    this.updateModel(value);
  }
}

/**
 * The text of a value: JSON with two-space indents, or nothing for `undefined` and for values that
 * JSON can't hold.
 * @param value - The value.
 */
function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return '';
  }
}
