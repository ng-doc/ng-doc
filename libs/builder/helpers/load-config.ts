import {cosmiconfigSync, PublicExplorerSync} from 'cosmiconfig';
import {CosmiconfigResult} from 'cosmiconfig/dist/types';
import {TypeScriptLoader} from 'cosmiconfig-typescript-loader';

import {NgDocConfiguration} from '../interfaces';

/**
 * Loads configuration from global configuration file
 *
 * @param path - Path to the configuration file
 * @param search - Whether to search for the configuration file or not
 */
export function loadConfig(path: string, search: boolean = true): [string, NgDocConfiguration] {
	const moduleName: string = 'ng-doc';

	const explorerSync: PublicExplorerSync = cosmiconfigSync(moduleName, {
		searchPlaces: [`${moduleName}.config.ts`],
		loaders: {
			'.ts': TypeScriptLoader(),
		},
	});
	const searchedFor: CosmiconfigResult | null = search ? explorerSync.search(path) : explorerSync.load(path);

	return [searchedFor?.filepath ?? '', searchedFor?.config ?? {}];
}
