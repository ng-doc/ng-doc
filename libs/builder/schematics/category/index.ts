import {dasherize} from '@angular-devkit/core/src/utils/strings';
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

import {CATEGORY_NAME} from '../../engine/variables';
import {findClosestFile} from '../utils';
import {NgDocBuildCategorySchema} from './schema';

/**
 * Generates a NgDocCategory
 *
 * @param {NgDocBuildCategorySchema} options - The options to generate the category
 * @returns {Rule} Angular Schematic Rule
 */
export function generate(options: NgDocBuildCategorySchema): Rule {
	return (host: Tree) => {
		const execPath: string = options?.path ?? '';

		const path: string = join(execPath, `/${dasherize(options.title)}`);
		const closestCategoryFile: string | null = options.category
			? findClosestFile(host, options?.path ?? '', CATEGORY_NAME)
			: null;
		const importPath: string | null = closestCategoryFile
			? relative(path, closestCategoryFile).replace(/.ts$/, '')
			: null;

		return chain([
			mergeWith(
				apply(url('./files'), [
					applyTemplates({...options, importPath}),
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
