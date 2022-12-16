import {NgDocCodeType} from '@ng-doc/core';
import {Options} from 'prettier';

/**
 *	Format code with Prettier
 *
 * @param {string} code Code to format
 * @param {NgDocCodeType} codeType Type of code
 * @returns {string} Formatted code
 */
export function formatCode(code: string, codeType: NgDocCodeType): string {
	try {
		return require('prettier').format(code, {parser: getPrettierParserFromCodeType(codeType)});
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
function getPrettierParserFromCodeType(codeType: NgDocCodeType): Options['parser'] {
	switch (codeType) {
		case 'TypeScript':
			return 'typescript';
		case 'HTML':
			return 'html';
		case 'CSS':
		case 'LESS':
		case 'SCSS':
		case 'SASS':
			return 'css';
		default:
			return 'typescript';
	}
}
