import {classify, dasherize} from '@angular-devkit/core/src/utils/strings';
import {
	apply,
	applyTemplates,
	chain,
	FileEntry,
	forEach,
	MergeStrategy,
	mergeWith,
	move,
	Rule,
	Tree,
	url,
} from '@angular-devkit/schematics';
import {join, relative} from 'path';

import {CATEGORY_NAME} from '../../engine';
import {findClosestFile} from '../../helpers';
import {extractDefaultExportName} from '../utils';
import {NgDocBuildCategorySchema} from './schema';

/**
 * Generates a NgDocCategory
 *
 * @param {NgDocBuildCategorySchema} options - The options to generate the category
 * @returns {Rule} Angular Schematic Rule
 */
export function build(options: NgDocBuildCategorySchema): Rule {
	return (host: Tree) => {
		const path: string = join(options.path, `/${dasherize(options.title)}`);
		const rootFolder: string = process.cwd();
		const closestCategoryFile: string | null = options.category
			? findClosestFile(rootFolder, options.path, CATEGORY_NAME)
			: null;
		const categoryConstantName: string | null =
			options.category && closestCategoryFile ? extractDefaultExportName(closestCategoryFile) : null;
		const categoryImportPath: string | null = closestCategoryFile
			? relative(path, closestCategoryFile).replace(/.ts$/, '')
			: null;

		options.constantName = `${classify(options.title)}Category`;

		return chain([
			mergeWith(
				apply(url('./files'), [
					applyTemplates({...options, categoryName: categoryConstantName, importPath: categoryImportPath}),
					move(path),
					forEach((fileEntry: FileEntry) => {
						if (host.exists(fileEntry.path)) {
							host.overwrite(fileEntry.path, fileEntry.content);
						}
						return fileEntry;
					}),
				]),
				MergeStrategy.Overwrite,
			),
		]);
	};
}
