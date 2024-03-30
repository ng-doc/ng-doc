import path from 'path';

import { DeclarationEntry, DeclarationTabEntry, EntryMetadata } from '../interfaces';

interface DeclarationTabConfig {
  title: string;
  folder: string;
  route?: string;
}

/**
 *
 * @param context
 * @param declaration
 * @param entry
 * @param tab
 * @param scope
 */
export function createDeclarationTabMetadata(
  entry: EntryMetadata<DeclarationEntry>,
  tab: DeclarationTabConfig,
): EntryMetadata<DeclarationTabEntry> {
  const outDir = path.join(entry.outDir, tab.folder);

  return {
    ...entry,
    route: tab.route ?? '',
    outDir,
    entry: {
      declaration: entry.entry.declaration,
      title: tab.title,
      route: tab.route,
      type: 'api',
    },
    parent: entry,
    outPath: path.join(outDir, 'page.ts'),
    title: tab.title,
  };
}
