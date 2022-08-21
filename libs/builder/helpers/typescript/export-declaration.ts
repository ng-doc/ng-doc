import {NgDocExportedDeclaration} from '@ng-doc/core';
import {ExportedDeclarations} from 'ts-morph';

import {mapDeclaration} from '../declaration-mappers';
import {isSupportedDeclaration} from '../is-supported-declaration';

/**
 *
 * @param declaration
 */
export function exportDeclaration(declaration: ExportedDeclarations): NgDocExportedDeclaration | undefined {
	if (isSupportedDeclaration(declaration)) {
		return mapDeclaration(declaration);
	}

	return undefined;
}
