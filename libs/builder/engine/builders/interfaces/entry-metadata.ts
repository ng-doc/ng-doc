import { NgDocCategory } from '@ng-doc/core';
import { ObjectLiteralExpression, SourceFile } from 'ts-morph';

import { Entry } from './entry';

export interface EntryMetadata<T extends Entry = Entry> {
  dir: string;
  path: string;
  dirName: string;
  outDir: string;
  route: string;
  absoluteRoute: () => string;
  breadcrumbs: () => string[];
  sourceFile: SourceFile;
  objectExpression: ObjectLiteralExpression;
  category?: EntryMetadata<NgDocCategory>;
  entry: T;
}
