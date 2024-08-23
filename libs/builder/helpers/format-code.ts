import { NgDocCodeType } from '@ng-doc/core';
import { format, resolveConfig } from '@prettier/sync';
import { Options } from 'prettier';

/**
 *    Format code with Prettier
 * @param code - Code to format
 * @param codeType - Type of code
 */
export function formatCode(code: string, codeType: NgDocCodeType | null = 'TypeScript'): string {
  try {
    if (codeType) {
      const parser: Options['parser'] | undefined = getPrettierParserFromCodeType(codeType);
      const config = resolveConfig(process.cwd(), { editorconfig: true });

      return (
        format(code, { ...config, parser, embeddedLanguageFormatting: 'auto' }) as unknown as string
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
