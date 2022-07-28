import * as webpack from 'webpack';

import {NgDocAssetsPlugin} from './plugins/assets.plugin';

/**
 *
 * @param config
 */
export function modifyConfiguration(config: webpack.Configuration): webpack.Configuration {
	config.plugins = [...(config.plugins ?? []), new NgDocAssetsPlugin()];

	return config;
}
