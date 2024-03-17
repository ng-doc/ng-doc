import { EntryMetadata, isPageEntryMetadata, PageEntry } from '../interfaces';

/**
 *
 * @param entry
 */
export function keywordTitle(entry: EntryMetadata<PageEntry>): string {
  if (entry.parent && isPageEntryMetadata(entry.parent)) {
    return `${keywordTitle(entry.parent)} (${entry.title})`;
  }

  return entry.title;
}
