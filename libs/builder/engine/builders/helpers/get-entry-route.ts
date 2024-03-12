import { isRoute } from '@ng-doc/core';
import path from 'path';

import { Entry, isApiEntry, isPageEntry } from '../interfaces';

/**
 *
 * @param entry
 * @param filePath
 */
export function getEntryRoute(entry: Entry, filePath: string): string {
  const dirName = path.basename(path.dirname(filePath));

  if (isPageEntry(entry, filePath)) {
    return (isRoute(entry?.route) ? entry?.route.path : entry?.route) ?? dirName;
  }

  if (isApiEntry(entry, filePath)) {
    return entry.route ?? 'api';
  }

  return dirName;
}
