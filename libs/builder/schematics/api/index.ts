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

import {NgDocBuildApiSchema} from './schema';

/**
 * Generates the NgDocApi entity
 *
 * @param {NgDocBuildPageSchema} options - The options to generate the API
 * @returns {Rule} Angular Schematic Rule
 */
export function build(options: NgDocBuildApiSchema): Rule {
	return (host: Tree) => {
		return chain([
			mergeWith(
				apply(url('./files'), [
					applyTemplates({...options}),
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
