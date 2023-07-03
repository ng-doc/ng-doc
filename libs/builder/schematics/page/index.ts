import {dasherize} from '@angular-devkit/core/src/utils/strings';
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
import {findClosestFile} from '../utils';
import {NgDocBuildPageSchema} from './schema';

const demoTemplates: string[] = ['ng-doc.module.ts.template'];

/**
 * Generates a NgDocPage
 *
 * @param {NgDocBuildPageSchema} options - The options to generate the page
 * @returns {Rule} Angular Schematic Rule
 */
export function generate(options: NgDocBuildPageSchema): Rule {
	return (host: Tree) => {
		const execPath = options?.path ?? '';
		const path = join(execPath, `/${dasherize(options.title)}`);
		const closestCategoryFile = options.category && findClosestFile(host, execPath, CATEGORY_NAME);
		const importPath = closestCategoryFile && relative(path, closestCategoryFile).replace(/.ts$/, '');

		return chain([
			mergeWith(
				apply(url('./files'), [
					filter(
						(path: string) =>
							(demoTemplates.includes(basename(path)) && options.module) || !demoTemplates.includes(basename(path)),
					),
					applyTemplates({
						...options,
						importPath,
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
