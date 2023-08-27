import { NgDocCodeType } from '@ng-doc/core';
import { Options } from 'prettier';

/**
 *	Format code with Prettier
 *
 * @param {string} code Code to format
 * @param {NgDocCodeType} codeType Type of code
 * @returns {string} Formatted code
 */
export function formatCode(code: string, codeType: NgDocCodeType | null = 'TypeScript'): string {
	try {
		if (codeType) {
			const parser: Options['parser'] | undefined = getPrettierParserFromCodeType(codeType);
			const config = require('prettier').resolveConfig.sync(process.cwd());

			return require('prettier')
				.format(code, { ...config, parser, embeddedLanguageFormatting: 'auto' })
				.trim();
		}

		return code.trim();
	} catch (e) {
		return code;
	}
}

/**
 *	Returns the parser for the given code type.
 *
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
		default:
			return undefined;
	}
}
