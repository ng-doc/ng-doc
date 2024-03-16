import { asArray, NgDocPage } from '@ng-doc/core';
import path from 'path';

import { EntryMetadata, MarkdownEntry } from '../interfaces';
import { markdownFrontMatter } from './markdown-front-matter';

/**
 *
 * @param parent
 */
export function createMarkdownMetadata(
  parent: EntryMetadata<NgDocPage>,
): Array<EntryMetadata<MarkdownEntry>> {
  return asArray(parent.entry.mdFile).map((mdFile, order) => {
    const mdPath = path.join(parent.dir, mdFile);
    const dir = path.dirname(mdPath);
    const dirName = path.basename(dir);
    const { data } = markdownFrontMatter<MarkdownEntry>(mdPath);
    const outDir = path.join(parent.outDir, data.route ?? 'index');

    return {
      ...parent,
      entry: data,
      path: mdPath,
      dir,
      dirName,
      parent,
      order,
      title: data.title ?? parent.title,
      route: data.route ?? '',
      outDir,
      outPath: path.join(outDir, 'page.ts'),
    };
  });
}
