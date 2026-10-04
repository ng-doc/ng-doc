import { Signal } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { NgDocPlaygroundOption } from '@ng-doc/core/interfaces';

/**
 * A field of a type control that the playground sets: a plain field, or a signal input
 * (`input()`) of the same name. The playground sets inputs with the `setInput()` method of the
 * component reference and assigns plain fields.
 */
export type NgDocTypeControlField<T> = T | Signal<T | undefined>;

/**
 * Interface describing Type Control.
 *
 * A type control is a `ControlValueAccessor`. The playground sets the fields below before the
 * control renders; declare them as plain fields or as signal inputs (`name = input<string>()`).
 * A field declared as an input (a signal input or an `@Input()`) is set as an input, so the
 * control's `ngOnChanges` reports it; a plain field is assigned and is not reported.
 */
export interface NgDocTypeControl<T = unknown> extends ControlValueAccessor {
  /**
   * The name of the input for which it is created, or the `label` that the playground's
   * `controls` give it
   */
  name?: NgDocTypeControlField<string>;
  /**
   * The description of the input (based on the comment)
   */
  description?: NgDocTypeControlField<string>;
  /**
   * The default value of the input
   */
  default?: NgDocTypeControlField<T>;
  /**
   * The list of possible values, it usually works only for Type Aliases which has several values.
   * An option is the source text of a union member (such as `'small'`), a plain value when
   * `isManual` is set, or the name and value of an enum member (`resolvePlaygroundOption` reads
   * all three)
   */
  options?: NgDocTypeControlField<Array<string | NgDocPlaygroundOption>>;
  /**
   * Determines if the property is manually added by the user using `controls` property in playground config
   */
  isManual?: NgDocTypeControlField<boolean>;
}
