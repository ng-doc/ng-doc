import {SchematicArgv} from '../schematic-argv';

/**
 * The interface describes the possible parameters for generating the page,
 * the generator can be called by the command below
 *
 * ```bash
 * ng g @ng-doc/builder:page
 * ```
 *
 * Here is an example showing how you can call a generator with all parameters
 * ```bash
 * ng g @ng-doc/builder:page MyPage -r custom-route -d -c -o 1
 * ```
 */
export interface NgDocBuildPageSchema extends SchematicArgv {
	/**
	 * Title of the page (can be provided as string after command)
	 */
	title: string;
	/**
	 * Custom route for the page (alias is `-r`, parent folder name by default)
	 */
	route?: string;
	/**
	 * Order of the page in sidebar (alias is `-o`, NgDoc sorting pages by name by default)
	 */
	order?: number;
	/**
	 * Provide true if you are going to use demo, playground on the page,
	 * then generator will generate module file (alias is `-m`)
	 */
	module?: boolean;
	/**
	 * If parameter was provided, generator will import first parent category automatically (alias is `-c`)
	 */
	category?: boolean;
	/**
	 * Keyword for the entity (alias is `-k`)
	 */
	keyword?: string;
}
