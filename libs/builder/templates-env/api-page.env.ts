import {ExportedDeclarations, Node} from 'ts-morph';
import {NgDocApiScope} from '../interfaces';

export interface NgDocApiPageEnv {
	Node: typeof Node;
	declaration: ExportedDeclarations;
	scope: NgDocApiScope
}
