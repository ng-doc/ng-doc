import { NgDocApi, NgDocCategory, NgDocPage } from '@ng-doc/core';
import { ObjectLiteralExpression, SourceFile } from 'ts-morph';

import { DeclarationEntry, Entry, MarkdownEntry } from './entry';

export interface EntryMetadata<T extends Entry = Entry> {
  dir: string;
  path: string;
  dirName: string;
  outDir: string;
  outPath: string;
  route: string;
  title: string;
  absoluteRoute: () => string;
  breadcrumbs: () => string[];
  sourceFile: SourceFile;
  objectExpression: ObjectLiteralExpression;
  parent: ParentEntryMetadata<T>;
  entry: T;
  order?: number;
  hidden?: boolean;
}

export type ParentEntryMetadata<T extends Entry> = T extends MarkdownEntry
  ? EntryMetadata<NgDocPage>
  : T extends DeclarationEntry
    ? EntryMetadata<NgDocApi>
    : EntryMetadata<NgDocCategory> | undefined;
