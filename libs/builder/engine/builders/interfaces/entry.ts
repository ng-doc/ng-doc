import { NgDocApi, NgDocCategory, NgDocPage } from '@ng-doc/core';
import { minimatch } from 'minimatch';

import { API_PATTERN, PAGE_PATTERN } from '../../variables';

export type Entry = NgDocPage | NgDocCategory | NgDocApi;
export type PageEntry = NgDocPage | NgDocApi;

/**
 *
 * @param entry
 * @param filePath
 */
export function isPageEntry(entry: Entry, filePath: string): entry is NgDocPage {
  return minimatch(filePath, PAGE_PATTERN);
}

/**
 *
 * @param entry
 * @param filePath
 */
export function isApiEntry(entry: Entry, filePath: string): entry is NgDocApi {
  return minimatch(filePath, API_PATTERN);
}
