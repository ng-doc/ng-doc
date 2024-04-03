import { NgDocCategory, NgDocPage } from '@ng-doc/core';
import { minimatch } from 'minimatch';
import { ObjectLiteralExpression, SourceFile } from 'ts-morph';

import { PAGE_PATTERN } from '../../variables';
import { DeclarationEntry, DeclarationTabEntry, Entry } from './entry';
import { MarkdownEntry } from './markdown-entry';

export interface EntryMetadata<T extends Entry = Entry> {
  dir: string;
  path: string;
  dirName: string;
  outDir: string;
  outPath: string;
  route: string;
  title: string;
  keywordTitle: string;
  absoluteRoute: () => string;
  breadcrumbs: () => string[];
  sourceFile: SourceFile;
  objectExpression: ObjectLiteralExpression;
  parent: ParentEntryMetadata<T>;
  entry: T;
  order?: number;
  hidden?: boolean;
}

export type ParentEntryMetadata<T extends Entry> = T extends DeclarationTabEntry
  ? EntryMetadata<DeclarationEntry>
  : T extends MarkdownEntry
    ? EntryMetadata<NgDocPage>
    : T extends DeclarationEntry
      ? undefined
      : EntryMetadata<NgDocCategory> | undefined;

/**
 *
 * @param entry
 */
export function isPageEntryMetadata(entry: EntryMetadata): entry is EntryMetadata<NgDocPage> {
  return minimatch(entry.path, PAGE_PATTERN);
}
