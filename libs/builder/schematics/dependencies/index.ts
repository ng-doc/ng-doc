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
import path, {basename} from 'path';

import {PAGE_NAME} from '../../engine';
import {extractDefaultExportName} from '../utils';
import {NgDocBuildDependenciesSchema} from './schema';

const demoTemplates: string[] = ['ng-doc.module.ts.template'];

/**
 * Generates a NgDocDependencies
 *
 * @param {NgDocBuildPageSchema} options - The options to generate the page
 * @returns {Rule} Angular Schematic Rule
 */
export function build(options: NgDocBuildDependenciesSchema): Rule {
	return (host: Tree) => {
		const pagePath: string = path.join(options.path, PAGE_NAME);
		const pageName: string = extractDefaultExportName(pagePath) ?? 'Page';

		return chain([
			mergeWith(
				apply(url('./files'), [
					filter(
						(path: string) =>
							(demoTemplates.includes(basename(path)) && options.module) ||
							!demoTemplates.includes(basename(path)),
					),
					applyTemplates({...options, pageName}),
					move(options.path),
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
