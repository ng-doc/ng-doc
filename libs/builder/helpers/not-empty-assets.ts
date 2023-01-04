import {NgDocAsset} from '../interfaces';

/**
 *
 * @param assets
 */
export function notEmptyAssets(assets: NgDocAsset[]): NgDocAsset[] {
	return assets.filter((assets: NgDocAsset) => !!assets.code.trim());
}
