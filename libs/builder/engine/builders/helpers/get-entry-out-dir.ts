import { asArray } from '@ng-doc/core';
import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { Entry, isApiEntry, isPageEntry } from '../interfaces';

/**
 *
 * @param context
 * @param entry
 * @param filePath
 */
export function getEntryOutDir(
  context: NgDocBuilderContext,
  entry: Entry,
  filePath: string,
): string {
  const dir = path.dirname(filePath);

  if (isPageEntry(entry, filePath)) {
    const relativePath = path.relative(context.docsPath, dir);

    return path.join(context.outGuidesDir, relativePath);
  }

  if (isApiEntry(entry, filePath)) {
    return path.join(...asArray(context.outApiDir, entry.route));
  }

  return context.outDir;
}
