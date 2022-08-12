import {ExportedDeclarations} from 'ts-morph';

import {NgDocApiScope} from '../interfaces';

export interface NgDocApiPageEnv {
	declaration: ExportedDeclarations;
	scope: NgDocApiScope;
}
