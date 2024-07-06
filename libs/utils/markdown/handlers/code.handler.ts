import { removeLinesFromCode } from '@ng-doc/core';
import fs from 'fs';
import { Handler } from 'mdast-util-to-hast/lib/state';
import { toString } from 'mdast-util-to-string';
import { EOL } from 'node:os';
import path from 'path';

import { NgDocCodeBlockMeta, parseCodeBlockMetadata } from '../../parsers';

export const code =
  (contextPath?: string, addDependency?: (dep: string) => void): Handler =>
  (state, node) => {
    const { lang, meta } = node;
    let value: string | undefined;

    const {
      file,
      name,
      highlightedLines,
      fileLineStart,
      fileLineEnd,
      group,
      active,
      icon,
    }: NgDocCodeBlockMeta = parseCodeBlockMetadata(meta ?? '');

    if (file && contextPath) {
      const relativeFilePath: string = path.join(contextPath, file);
      const fileContent: string = fs
        .readFileSync(relativeFilePath ?? '', 'utf8')
        .split(EOL)
        .slice(fileLineStart, fileLineEnd)
        .join(EOL)
        .trim();

      addDependency && addDependency(relativeFilePath);

      value = removeLinesFromCode(fileContent);
    }

    const text = value ? toString({type: 'text', value}) : toString(node);

    return {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {
            className: [`language-${lang}`],
            lang,
            name,
            icon,
            group,
            active,
            highlightedLines: JSON.stringify(highlightedLines ?? []),
          },
          children: [
            {
              type: 'text',
              value: text
            },
          ],
        },
      ],
    };
  };
