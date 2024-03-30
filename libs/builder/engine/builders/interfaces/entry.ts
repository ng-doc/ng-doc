import { NgDocApi, NgDocCategory, NgDocPage } from '@ng-doc/core';
import { minimatch } from 'minimatch';

import { NgDocSupportedDeclaration } from '../../../types';
import { API_PATTERN, PAGE_PATTERN } from '../../variables';
import { MarkdownEntry } from './markdown-entry';

export interface DeclarationEntry {
  declaration: NgDocSupportedDeclaration;
}

export type DeclarationTabEntry = MarkdownEntry & DeclarationEntry;

export type PageEntry =
  | NgDocPage
  | NgDocApi
  | MarkdownEntry
  | DeclarationEntry
  | DeclarationTabEntry;
export type FileEntry = NgDocPage | NgDocApi | NgDocCategory;
export type Entry = PageEntry | NgDocCategory;

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
