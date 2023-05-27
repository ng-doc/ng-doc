import {classify, dasherize} from '@angular-devkit/core/src/utils/strings';
import {
	apply,
	applyTemplates,
	chain,
	FileEntry,
	filter,
	forEach,
	MergeStrategy,
	mergeWith,
	move,
	Rule,
	Tree,
	url,
} from '@angular-devkit/schematics';
import {basename, join, relative} from 'path';

import {CATEGORY_NAME} from '../../engine/variables';
import {findClosestFile} from '../../helpers/find-closest-file';
import {extractDefaultExportName} from '../utils/extract-default-export-name';
import {NgDocBuildPageSchema} from './schema';

const demoTemplates: string[] = ['ng-doc.module.ts.template'];

/**
 * Generates a NgDocPage
 *
 * @param {NgDocBuildPageSchema} options - The options to generate the page
 * @returns {Rule} Angular Schematic Rule
 */
export function build(options: NgDocBuildPageSchema): Rule {
	return (host: Tree) => {
		const path: string = join(options.path, `/${dasherize(options.title)}`);
		const closestCategoryFile: string | null = options.category ? findClosestFile(options.path, CATEGORY_NAME) : null;
		const pageName: string = classify(options.title + 'Page');
		const categoryConstantName: string | null =
			options.category && closestCategoryFile ? extractDefaultExportName(closestCategoryFile) : null;
		const categoryImportPath: string | null = closestCategoryFile
			? relative(path, closestCategoryFile).replace(/.ts$/, '')
			: null;

		return chain([
			mergeWith(
				apply(url('./files'), [
					filter(
						(path: string) =>
							(demoTemplates.includes(basename(path)) && options.module) || !demoTemplates.includes(basename(path)),
					),
					applyTemplates({
						...options,
						categoryName: categoryConstantName,
						importPath: categoryImportPath,
						pageName,
						keyword: options.keyword,
					}),
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
