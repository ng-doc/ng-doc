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

import { NgDocBuildApiSchema } from './schema';

/**
 * Generates the NgDocApi entity
 * @param {NgDocBuildPageSchema} options - The options to generate the API
 * @returns {Rule} Angular Schematic Rule
 */
export function generate(options: NgDocBuildApiSchema): Rule {
  return (host: Tree) => {
    const execPath: string = options?.path ?? '';

    return chain([
      mergeWith(
        apply(url('./files'), [
          applyTemplates({ ...options }),
          move(execPath),
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
