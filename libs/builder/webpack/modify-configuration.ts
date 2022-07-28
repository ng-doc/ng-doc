import * as webpack from 'webpack';

import {NgDocAssetsPlugin} from './assets.plugin';

/**
 *
 * @param config
 */
export function modifyConfiguration(config: webpack.Configuration): webpack.Configuration {
	config.plugins = [...(config.plugins ?? []), new NgDocAssetsPlugin()];

	return config;
}
