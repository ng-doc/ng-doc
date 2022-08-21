import {NgDocExportedDeclaration} from '@ng-doc/core';

export interface NgDocApiDisplayerContext<T extends NgDocExportedDeclaration = NgDocExportedDeclaration> {
	api: T;
}
