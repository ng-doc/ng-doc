import { asArray, NgDocPage } from '@ng-doc/core';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';

import { EntryMetadata, MarkdownEntry, MarkdownFrontMatterData } from '../interfaces';

/**
 *
 * @param parent
 */
export function createMarkdownMetadata(
  parent: EntryMetadata<NgDocPage>,
): Array<EntryMetadata<MarkdownEntry>> {
  return asArray(parent.entry.mdFile).map((mdFile, order) => {
    const mdPath = path.join(parent.dir, mdFile);
    const markdown = fs.readFileSync(mdPath, 'utf-8');
    const { data, content } = matter(markdown) as unknown as {
      data: MarkdownFrontMatterData;
      content: string;
    };
    const outDir = path.join(parent.outDir, data.route ?? 'index');

    return {
      ...parent,
      entry: {
        metadata: data,
        mdPath,
        content,
      },
      order,
      parent,
      title: data.title ?? parent.title,
      route: data.route ?? '',
      outDir,
      outPath: path.join(outDir, 'page.ts'),
    };
  });
}
