import { NgDocCodeType } from '@ng-doc/core';
import prettierSync from '@prettier/sync';
import { join } from 'node:path';
import { Options } from 'prettier';

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
      const config = prettierSync.resolveConfig(
        // Prettier searches from a file's parent, so use a synthetic path inside the directory.
        configDirectory ? join(configDirectory, '__ng_doc_format__.ts') : process.cwd(),
        { editorconfig: true, useCache: false },
      );

      return (
        prettierSync.format(code, {
          ...config,
          parser,
          embeddedLanguageFormatting: 'auto',
        }) as unknown as string
      ).trim();
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
