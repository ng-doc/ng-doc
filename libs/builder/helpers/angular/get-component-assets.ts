import {ClassDeclaration} from 'ts-morph';

import {NgDocAsset} from '../../interfaces';
import {buildFileAsset} from '../build-assets';
import {getComponentSourceFiles} from './get-component-source-files';

/**
 * Creates an array of assets from a component source file.
 *
 * @param cls - The class declaration.
 */
export function getComponentAssets(
	cls: ClassDeclaration,
): NgDocAsset[] {
	return getComponentSourceFiles(cls).map((filePath: string) => buildFileAsset(filePath));
}
