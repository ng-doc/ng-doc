import { NgDocCategory } from '@ng-doc/core';
import { ObjectLiteralExpression, SourceFile } from 'ts-morph';

import { Entry } from './entry';

export interface EntryMetadata<T extends Entry = Entry> {
	dir: string;
	dirName: string;
	relativePath: string;
	outDir: string;
	route: string;
	absoluteRoute: () => string;
	sourceFile: SourceFile;
	objectExpression: ObjectLiteralExpression;
	category?: EntryMetadata<NgDocCategory>;
	entry: T;
}
