import {cosmiconfigSync, PublicExplorerSync} from 'cosmiconfig';
import {CosmiconfigResult} from 'cosmiconfig/dist/types';
import {TypeScriptSWCLoader} from 'cosmiconfig-typescript-swc-loader';

import {NgDocConfiguration} from '../interfaces';

/**
 * Loads configuration from global configuration file
 *
 * @param searchFrom
 */
export function loadConfig(searchFrom: string): [string, NgDocConfiguration] {
	const moduleName: string = 'ng-doc';

	const explorerSync: PublicExplorerSync = cosmiconfigSync(moduleName, {
		searchPlaces: [`${moduleName}.config.ts`],
		loaders: {
			'.ts': TypeScriptSWCLoader(),
		},
	});
	const searchedFor: CosmiconfigResult | null = explorerSync.search(searchFrom);

	return [searchedFor?.filepath ?? '', searchedFor?.config ?? {}];
}
