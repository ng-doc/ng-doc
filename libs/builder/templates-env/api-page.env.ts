import {NgDocApiScope} from '@ng-doc/core';
import {ExportedDeclarations} from 'ts-morph';

export interface NgDocApiPageEnv {
	declaration: ExportedDeclarations;
	scope: NgDocApiScope;
}
