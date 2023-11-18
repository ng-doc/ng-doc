import { NgDocStyleType } from '@ng-doc/core';
import path from 'path';

import { NgDocAsset } from '../interfaces';
import { codeTypeFromExt } from './code-type-from-ext';
import { processLegacySnippets } from './process-legacy-snippets';
import { processSnippets } from './process-snippets';

/**
 * Finds all snippets in an asset and returns them as assets.
 * @param asset - Asset
 * @param inlineStylesType - Inline styles type
 */
export function snippetsFromAsset(
	asset: NgDocAsset,
	inlineStylesType: NgDocStyleType,
): NgDocAsset[] {
	const snippets = processLegacySnippets(asset.code).concat(
		processSnippets(asset.code, path.dirname(asset.filePath)),
	);
	const codeType = codeTypeFromExt(asset.filePath);
	const isStylesFile = ['CSS', 'SCSS', 'LESS', 'SASS'].includes(codeType.toUpperCase());

	return snippets.map(({ code, title, lang, icon, opened }, i) => {
		const language = lang === 'styles' ? (isStylesFile ? codeType : inlineStylesType) : lang;

		return {
			...asset,
			code,
			title: title ?? `Snippet #${i + 1}`,
			icon,
			opened,
			lang: language,
		};
	});
}
