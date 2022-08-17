import {NgDocExportedDeclaration} from '@ng-doc/core';
import {ExportedDeclarations} from 'ts-morph';

import {isSupportedDeclaration} from '../is-supported-declaration';

/**
 *
 * @param declaration
 */
export function exportDeclaration(declaration: ExportedDeclarations): NgDocExportedDeclaration | undefined {
	if (isSupportedDeclaration(declaration)) {
		return declaration.getStructure() as unknown as NgDocExportedDeclaration;
	}

	return undefined;
}
