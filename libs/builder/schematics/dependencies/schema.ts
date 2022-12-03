import {SchematicArgv} from '../schematic-argv';

/**
 * The interface describes the possible parameters for generating the Dependencies entity,
 * the generator can be called by the command below
 *
 * ```bash
 * ng g @ng-doc/builder:dependencies
 * ```
 *
 * Here is an example showing how you can call a generator with all parameters
 * ```bash
 * ng g @ng-doc/builder:dependencies -m
 * ```
 */
export interface NgDocBuildDependenciesSchema extends SchematicArgv {
	/**
	 * Should NgDoc generates module (alias is `-m`)
	 */
	module?: boolean;
}
