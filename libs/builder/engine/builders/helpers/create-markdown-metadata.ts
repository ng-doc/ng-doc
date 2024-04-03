import { NgDocPage } from '@ng-doc/core';
import path from 'path';

import { EntryMetadata, MarkdownEntry } from '../interfaces';
import { markdownFrontMatter } from './markdown-front-matter';

/**
 *
 * @param parent
 * @param mdFile
 */
export function createMarkdownMetadata(
  parent: EntryMetadata<NgDocPage>,
  mdFile: string,
): EntryMetadata<MarkdownEntry> {
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
    title: data.title ?? parent.title,
    keywordTitle: parent.title + (data.title ? ` - ${data.title}` : ''),
    route: data.route ?? '',
    outDir,
    outPath: path.join(outDir, 'page.ts'),
  };
}
