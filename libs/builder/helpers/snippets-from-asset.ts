import {NgDocAsset} from '../interfaces';
import {processSnippets} from './process-snippets';
import {codeTypeFromExt} from './code-type-from-ext';
import {NgDocStyleType} from '@ng-doc/core';

/**
 * Finds all snippets in an asset and returns them as assets.
 *
 * @param asset - Asset
 * @param inlineStylesType - Inline styles type
 */
export function snippetsFromAsset(asset: NgDocAsset, inlineStylesType: NgDocStyleType): NgDocAsset[] {
	const snippets = processSnippets(asset.code);
	const codeType = codeTypeFromExt(asset.filePath);
	const isStylesFile = ['CSS', 'SCSS', 'LESS', 'SASS'].includes(codeType.toUpperCase());

	return snippets.map(({content, name, type}) => ({
		...asset,
		code: content,
		title: name,
		type: type === 'styles'
			? isStylesFile
				? codeType
				: inlineStylesType
			: type,
	}));
}
