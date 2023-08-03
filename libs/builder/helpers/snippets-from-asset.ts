import {NgDocStyleType} from '@ng-doc/core';

import {NgDocAsset} from '../interfaces';
import {codeTypeFromExt} from './code-type-from-ext';
import {processLegacySnippets} from './process-legacy-snippets';
import {processSnippets} from './process-snippets';

/**
 * Finds all snippets in an asset and returns them as assets.
 *
 * @param asset - Asset
 * @param inlineStylesType - Inline styles type
 */
export function snippetsFromAsset(asset: NgDocAsset, inlineStylesType: NgDocStyleType): NgDocAsset[] {
	const snippets = processLegacySnippets(asset.code).concat(processSnippets(asset.code));
	const codeType = codeTypeFromExt(asset.filePath);
	const isStylesFile = ['CSS', 'SCSS', 'LESS', 'SASS'].includes(codeType.toUpperCase());

	return snippets.map(({content, name, type}) => {
		const cType = type === 'styles' ? (isStylesFile ? codeType : inlineStylesType) : type;

		return {
			...asset,
			code: content,
			title: name ?? cType,
			type: cType,
		};
	});
}
