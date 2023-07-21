import {NgDocAsset, NgDocComponentAsset} from '@ng-doc/builder';

/**
 *
 * @param componentAssets
 */
export function assetsFromComponentAsset(componentAssets: NgDocComponentAsset): NgDocAsset[] {
	return Object.keys(componentAssets)
		.map((key: string) => componentAssets[key])
		.flat()
}
