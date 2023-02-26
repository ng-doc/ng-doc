/**
 * @param defaultConfig
 * @param currentConfig
 * @param hostConfig
 */
import {isPresent} from '@ng-doc/core/helpers/is-present';
import {NgDocOverlayProperties} from '@ng-doc/ui-kit/interfaces';

/**
 *
 * @param defaultConfig
 * @param currentConfig
 * @param hostConfig
 */
export function mergeOverlayConfigs(
	defaultConfig: NgDocOverlayProperties,
	currentConfig: NgDocOverlayProperties,
	hostConfig: NgDocOverlayProperties = {},
): NgDocOverlayProperties {
	const configKeys: Iterable<keyof NgDocOverlayProperties> & Array<keyof NgDocOverlayProperties> = Object.keys({
		...defaultConfig,
		...currentConfig,
	}) as Iterable<keyof NgDocOverlayProperties> & Array<keyof NgDocOverlayProperties>;
	const newConfig: NgDocOverlayProperties = {};

	for (const key of configKeys) {
		newConfig[key] = (
			defaultConfig[key] !== currentConfig[key] && isPresent(currentConfig[key])
				? currentConfig[key]
				: (hostConfig && hostConfig[key]) ?? defaultConfig[key]
		) as never;
	}

	return newConfig;
}
