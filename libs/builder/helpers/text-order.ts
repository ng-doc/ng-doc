/**
 * The one collator that orders names, titles, keys and paths wherever their order reaches generated
 * output, in both engines: navigation, API members, keywords, discovery entries, the output
 * manifest and the diagnostics that list them.
 *
 * `localeCompare` without a locale uses the process's default locale (`LANG`, `LC_ALL`), so the
 * same docs tree produced different output on machines with different locales (in Swedish `Ä`
 * sorts after `Z`). A fixed locale makes the order the same everywhere. English with the default
 * options is what `localeCompare` gave on an English machine, and on a C or POSIX one, which V8
 * maps to `en-US`, so today's output keeps its order.
 */
const TEXT_COLLATOR = new Intl.Collator('en');

/**
 * Compares two strings in NgDoc's fixed text order. Use it instead of `localeCompare` wherever the
 * order can reach generated output.
 * @param left - A string.
 * @param right - Another string.
 * @returns A negative number, zero or a positive number, as `localeCompare` does.
 */
export function compareText(left: string, right: string): number {
  return TEXT_COLLATOR.compare(left, right);
}
