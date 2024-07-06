import { renderTemplate } from '@ng-doc/builder';
import { NgDocStyleType } from '@ng-doc/core';
import { removeLinesFromCode } from '@ng-doc/core/helpers/remove-lines-from-code';
import { ClassDeclaration } from 'ts-morph';

import { NgDocAsset } from '../../interfaces';
import { buildFileAsset } from '../build-file-assets';
import { snippetsFromAsset } from '../snippets-from-asset';
import { getComponentSourceFiles } from './get-component-source-files';

/**
 * Creates an array of assets from a component source file.
 * @param cls - The class declaration.
 */
export function getComponentAssets(cls: ClassDeclaration): NgDocAsset[] {
	return getComponentSourceFiles(cls).map((filePath: string) => buildFileAsset(filePath));
}

/**
 * Creates an array of assets from a component source file.
 * @param cls - The class declaration.
 * @param inlineStyleLanguage
 */
export function getDemoAssets(
	cls: ClassDeclaration,
	inlineStyleLanguage: NgDocStyleType,
): NgDocAsset[] {
	const assets = getComponentSourceFiles(cls)
		.map((filePath: string) => buildFileAsset(filePath))
		.map((asset) => {
			const snippets = snippetsFromAsset(asset, inlineStyleLanguage);

			return snippets.length ? snippets : [asset];
		})
		.flat()
		.map((asset) => ({
			...asset,
			code: renderTemplate('./code.html.nunj', {
				context: { code: removeLinesFromCode(asset.code), lang: asset.lang || 'ts' },
			}).trim(),
		}));

	return assets;
}
