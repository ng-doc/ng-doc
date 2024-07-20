import { classify, dasherize } from '@angular-devkit/core/src/utils/strings';
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
import { basename, join, relative } from 'path';

import { CATEGORY_NAME } from '../../engine/variables';
import { posix } from '../../helpers/posix';
import { findClosestFile, getTitle, varNameValidation } from '../utils';
import { extractDefaultExportName } from '../utils/extract-default-export-name';
import { NgDocBuildPageSchema } from './schema';

const demoTemplates: string[] = ['ng-doc.module.ts.template'];

/**
 * Generates a NgDocPage
 * @param {NgDocBuildPageSchema} options - The options to generate the page
 * @returns {Rule} Angular Schematic Rule
 */
export function generate(options: NgDocBuildPageSchema): Rule {
  return (host: Tree) => {
    const pageName: string = options.name ?? classify(options.title + 'Page');

    options.title = getTitle(options.title);
    options.keyword = options.keyword ?? pageName;

    varNameValidation(pageName);

    const execPath: string = options?.path ?? '';
    const pageFolder: string =
      dasherize(options.name ?? '').replace(/-page$/, '') || dasherize(options.title);
    const path: string = join(execPath, `/${pageFolder}`);
    const closestCategoryFile: string | null =
      (options.category && findClosestFile(host, execPath, CATEGORY_NAME)) || null;
    const categoryConstantName: string | null =
      (options.category &&
        closestCategoryFile &&
        extractDefaultExportName(host, closestCategoryFile)) ||
      null;
    const categoryImportPath: string | null =
      (closestCategoryFile && posix(relative(path, closestCategoryFile)).replace(/.ts$/, '')) ||
      null;

    return chain([
      mergeWith(
        apply(url('./files'), [
          filter((path: string) => !demoTemplates.includes(basename(path))),
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
