import {NgDocApiScope} from '@ng-doc/builder';
import {ExportedDeclarations, Node} from 'ts-morph';

export interface NgDocApiPageEnv {
	Node: typeof Node;
	declaration: ExportedDeclarations;
	scope: NgDocApiScope
}
