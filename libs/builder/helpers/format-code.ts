import {NgDocCodeType} from '@ng-doc/core';
import {Options} from 'prettier';

/**
 *	Format code with Prettier
 *
 * @param {string} code Code to format
 * @param {NgDocCodeType} codeType Type of code
 * @returns {string} Formatted code
 */
export function formatCode(code: string, codeType: NgDocCodeType = 'TypeScript'): string {
	try {
		const parser: Options['parser'] | undefined = getPrettierParserFromCodeType(codeType);

		return require('prettier').format(code, {parser}).trim();
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
		default:
			return codeType.toLowerCase();
	}
}
