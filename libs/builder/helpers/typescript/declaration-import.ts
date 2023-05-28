import * as path from 'path';

import {GLOBALS} from '../../engine';
import {NgDocSupportedDeclarations} from '../../types';

/**
 *
 * @param declaration
 */
export function declarationImport(declaration: NgDocSupportedDeclarations): string {
	if (declaration.isExported()) {
		const filePath: string = declaration.getSourceFile().getFilePath();
		const relativeImport: string = path
			.relative(GLOBALS.workspaceRoot, filePath)
			.replace(/.ts$/, '')

		return `import {${declaration.getName()}} from '${relativeImport}';`;
	}

	return '';
}
