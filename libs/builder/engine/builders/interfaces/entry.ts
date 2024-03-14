import { NgDocApi, NgDocCategory, NgDocPage } from '@ng-doc/core';
import { minimatch } from 'minimatch';

import { NgDocSupportedDeclaration } from '../../../types';
import { API_PATTERN, PAGE_PATTERN } from '../../variables';
import { MarkdownFrontMatterData } from './markdown-front-matter-data';

export interface MarkdownEntry {
  metadata: MarkdownFrontMatterData;
  mdPath: string;
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DeclarationEntry {
  declaration: NgDocSupportedDeclaration;
}

export type PageEntry = NgDocPage | NgDocApi | MarkdownEntry | DeclarationEntry;
export type FileEntry = NgDocPage | NgDocApi | NgDocCategory;
export type Entry = PageEntry | NgDocCategory;

export type ParentEntry<T extends Entry> = T extends MarkdownEntry
  ? NgDocPage
  : T extends DeclarationEntry
    ? NgDocApi
    : NgDocCategory;

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
