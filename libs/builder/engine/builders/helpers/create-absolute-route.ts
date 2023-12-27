import { NgDocCategory, NgDocPage } from '@ng-doc/core';
import path from 'path';
import { Node, SourceFile } from 'ts-morph';

import { getObjectExpressionFromDefault } from '../../../helpers';
import { getEntryRoute } from './get-entry-route';

/**
 * Creates an absolute route for a given entry and source file.
 * @param {NgDocPage | NgDocCategory} entry - The entry for which to create the route.
 * @param {SourceFile} sourceFile - The source file associated with the entry.
 * @returns {string} The absolute route for the given entry and source file.
 */
export function createAbsoluteRoute(
	entry: NgDocPage | NgDocCategory,
	sourceFile: SourceFile,
): string {
	const routeSegment =
		getEntryRoute(entry) || path.basename(path.dirname(sourceFile.getFilePath()));

	if (entry.category) {
		const categorySourceFile = getCategorySourceFile(sourceFile);

		if (categorySourceFile) {
			return createAbsoluteRoute(entry.category, categorySourceFile) + '/' + routeSegment;
		}
	}

	return routeSegment;
}

/**
 * Retrieves the source file for a given category.
 * @param {SourceFile} sourceFile - The source file to retrieve the category from.
 * @returns {SourceFile | undefined} The source file for the category, or undefined if it could not be found.
 */
function getCategorySourceFile(sourceFile: SourceFile): SourceFile | undefined {
	const objectExpression = getObjectExpressionFromDefault(sourceFile);

	if (objectExpression) {
		const categoryProperty = objectExpression.getProperty('category');

		if (Node.isPropertyAssignment(categoryProperty)) {
			const initializer = categoryProperty.getInitializer();

			if (initializer) {
				const categorySourceFile = initializer
					.getSymbol()
					?.getAliasedSymbol()
					?.getValueDeclaration()
					?.getSourceFile();

				if (categorySourceFile) {
					return categorySourceFile;
				}
			}
		}
	}

	return undefined;
}
