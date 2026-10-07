import { extractValueOrThrow } from '@ng-doc/core/helpers/extract-value';
import { NgDocPlaygroundOption } from '@ng-doc/core/interfaces';

/** An option of a playground property, resolved to the value it sets and the text it shows. */
export interface NgDocResolvedPlaygroundOption {
  /** The text shown for the option. */
  label: string;
  /** The value the option sets. */
  value: unknown;
}

/**
 * Resolves an option of a playground property. A named option (an enum member) carries its
 * value; a plain value from the playground's `controls` is the value itself; any other option is
 * the source text of a union member, such as `'small'`, and is evaluated; it throws when that
 * text can't be evaluated.
 * @param option - The option.
 * @param isManual - Whether the options come from the playground's `controls`.
 * @returns The value of the option and the text that shows it.
 */
export function resolvePlaygroundOption(
  option: string | NgDocPlaygroundOption,
  isManual?: boolean,
): NgDocResolvedPlaygroundOption {
  if (typeof option !== 'string') {
    return { label: option.label, value: option.value };
  }

  const value: unknown = isManual ? option : extractValueOrThrow(option);

  return { label: String(value), value };
}
