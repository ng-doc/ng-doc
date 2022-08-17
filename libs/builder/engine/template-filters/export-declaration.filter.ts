import {NgDocExportedDeclaration} from '@ng-doc/core';
import {ExportedDeclarations} from 'ts-morph';

import {exportDeclaration as helper} from '../../helpers/typescript/export-declaration';
import {NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID} from '../../naming';

/**
 *
 * @param declaration
 */
export function exportDeclaration(declaration: ExportedDeclarations): string {
	const structure: NgDocExportedDeclaration | undefined = helper(declaration);

	return `<div id="${NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID}">${structure ? JSON.stringify(structure) : ''}</div>`;
}
