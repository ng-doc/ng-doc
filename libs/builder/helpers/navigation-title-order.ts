import { compareText } from './text-order';

/**
 * Compares two navigation titles in the fixed navigation order, in both engines: the shared text
 * order (`compareText`), so a sidebar does not depend on the process locale.
 * @param left - A title.
 * @param right - Another title.
 * @returns A negative number, zero or a positive number, as `localeCompare` does.
 */
export function compareNavigationTitles(left: string, right: string): number {
  return compareText(left, right);
}
