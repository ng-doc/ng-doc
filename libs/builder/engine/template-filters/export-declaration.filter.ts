import {NgDocExportedDeclaration} from '@ng-doc/core';
import {ExportedDeclarations} from 'ts-morph';

import {exportDeclaration as helper} from '../../helpers/typescript/export-declaration';
import {NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID} from '../../naming';

/**
 *
 * @param declaration
 * @param header
 */
export function exportDeclaration(declaration: ExportedDeclarations, header: boolean = true): string {
	const structure: NgDocExportedDeclaration | undefined = helper(declaration);

	return `<div id="${NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID}" data-header="${header}">${structure ? JSON.stringify(structure) : ''}</div>`;
}
