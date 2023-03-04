import {cosmiconfigSync, PublicExplorerSync} from 'cosmiconfig';
import {CosmiconfigResult} from 'cosmiconfig/dist/types';
import {TypeScriptLoader} from 'cosmiconfig-typescript-loader';

import {NgDocConfiguration} from '../interfaces';

/**
 * Loads configuration from global configuration file
 *
 * @param searchFrom
 */
export function loadConfig(searchFrom: string): NgDocConfiguration {
	const moduleName: string = 'ng-doc';

	const explorerSync: PublicExplorerSync = cosmiconfigSync(moduleName, {
		searchPlaces: [
			'package.json',
			`.${moduleName}rc`,
			`.${moduleName}rc.json`,
			`.${moduleName}rc.yaml`,
			`.${moduleName}rc.yml`,
			`.${moduleName}rc.js`,
			`.${moduleName}rc.ts`,
			`.${moduleName}rc.cjs`,
			`${moduleName}.config.js`,
			`${moduleName}.config.ts`,
			`${moduleName}.config.cjs`,
		],
		loaders: {
			'.ts': TypeScriptLoader(),
		},
	});
	const searchedFor: CosmiconfigResult | null = explorerSync.search(searchFrom);

	return searchedFor ? searchedFor.config : {};
}
