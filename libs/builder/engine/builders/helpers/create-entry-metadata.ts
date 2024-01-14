import path from 'path';
import { Node, SourceFile } from 'ts-morph';

import { getObjectExpressionFromDefault } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Entry, EntryMetadata } from '../interfaces';
import { getEntryRoute } from './get-entry-route';

/**
 *
 * @param context
 * @param entry
 * @param sourceFile
 */
export function createEntryMetadata<T extends Entry>(
	context: NgDocBuilderContext,
	entry: T,
	sourceFile: SourceFile,
): EntryMetadata<T> {
	const dir = sourceFile.getDirectoryPath();
	const dirName = path.basename(dir);
	const route = getEntryRoute(entry) ?? dirName;
	const entryPath = sourceFile.getFilePath();
	const categorySourceFile = entry.category && getCategorySourceFile(sourceFile);
	const relativePath = path.relative(context.docsPath, dir);
	const outDir = path.join(context.outGuidesDir, relativePath);
	const objectExpression = getObjectExpressionFromDefault(sourceFile);

	if (!objectExpression) {
		throw new Error(
			`No object expression found in ${entryPath}, make sure the file has a default export.`,
		);
	}

	return {
		dir,
		dirName,
		route,
		relativePath,
		outDir,
		sourceFile,
		objectExpression,
		absoluteRoute: function (): string {
			const routePrefix = context.config.routePrefix ? `${context.config.routePrefix}/` : '';
			const parentRoute = this.category?.absoluteRoute() ?? '';
			const parentRoutePrefix = parentRoute ? `${parentRoute}/` : '';

			return `${parentRoutePrefix || routePrefix}${this.route}`;
		},
		category:
			entry.category && categorySourceFile
				? createEntryMetadata(context, entry.category, categorySourceFile)
				: undefined,
		entry,
	};
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
