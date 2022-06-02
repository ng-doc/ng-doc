import {Options} from 'prettier';

import {NgDocCodeType} from '../types';

/**
 *	Format code with Prettier
 *
 * @param {string} code Code to format
 * @param {NgDocCodeType} codeType Type of code
 * @returns {string} Formatted code
 */
export function formatCode(code: string, codeType: NgDocCodeType): string {
	return require('prettier').format(code, {parser: getPrettierParserFromCodeType(codeType)});
}

/**
 *	Returns the parser for the given code type.
 *
 * @param {NgDocCodeType} codeType Code type
 * @returns {string} Parser
 */
function getPrettierParserFromCodeType(codeType: NgDocCodeType): Options['parser'] {
	switch (codeType) {
		case 'typescript':
			return 'typescript';
		case 'html':
			return 'html';
		case 'css':
		case 'less':
		case 'scss':
		case 'sass':
			return 'css';
		default:
			return 'typescript';
	}
}
