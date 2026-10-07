import { NgDocCodeType } from '@ng-doc/core';
import prettierSync from '@prettier/sync';
import { join } from 'node:path';
import { Options } from 'prettier';

import { activeFormatCodeCache } from './format-cache';

/**
 *    Format code with Prettier
 * @param code - Code to format
 * @param codeType - Type of code
 * @param configDirectory - Optional workspace directory; omitted preserves legacy cwd lookup.
 */
export function formatCode(
  code: string,
  codeType: NgDocCodeType | null = 'TypeScript',
  configDirectory?: string,
): string {
  try {
    if (codeType) {
      const parser: Options['parser'] | undefined = getPrettierParserFromCodeType(codeType);
      // The new engine's cache, when it formats (see `./format-cache`); none in the legacy engine.
      const cache = activeFormatCodeCache();
      const resolve = () =>
        prettierSync.resolveConfig(
          // Prettier searches from a file's parent, so use a synthetic path inside the directory.
          configDirectory ? join(configDirectory, '__ng_doc_format__.ts') : process.cwd(),
          { editorconfig: true, useCache: false },
        );
      const config = cache ? cache.config(configDirectory, resolve) : resolve();
      const format = () =>
        (
          prettierSync.format(code, {
            ...config,
            parser,
            embeddedLanguageFormatting: 'auto',
          }) as unknown as string
        ).trim();

      return cache && typeof parser === 'string'
        ? cache.format({ code, parser, config }, format)
        : format();
    }

    return code.trim();
  } catch (e) {
    return code;
  }
}

/**
 *    Returns the parser for the given code type.
 * @param {NgDocCodeType} codeType Code type
 * @returns {string} Parser
 */
function getPrettierParserFromCodeType(codeType: NgDocCodeType): Options['parser'] | undefined {
  switch (codeType) {
    case 'CSS':
    case 'LESS':
    case 'SCSS':
    case 'SASS':
      return 'css';
    case 'HTML':
      return 'html';
    case 'TypeScript':
    case 'JavaScript':
      return 'typescript';
    case 'Markdown':
      return 'markdown';
    default:
      return undefined;
  }
}
