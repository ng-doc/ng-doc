import {NgDocExportedDeclaration} from '@ng-doc/core';

export interface NgDocApiDisplayer<T extends NgDocExportedDeclaration = NgDocExportedDeclaration> {
	declaration?: T;
}
