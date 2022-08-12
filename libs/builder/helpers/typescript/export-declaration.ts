import {ExportedDeclarations} from 'ts-morph';

import {NgDocExportedDeclaration} from '../../interfaces';
import {isSupportedDeclaration} from '../is-supported-declaration';

/**
 *
 * @param declaration
 */
export function exportDeclaration(declaration: ExportedDeclarations): NgDocExportedDeclaration | undefined {
	if (isSupportedDeclaration(declaration)) {
		return declaration.getStructure();
	}

	return undefined;
}
