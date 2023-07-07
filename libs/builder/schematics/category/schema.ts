import {SchematicArgv} from '../schematic-argv';

export interface NgDocBuildCategorySchema extends SchematicArgv {
	/**
	 * Title of the category (can be provided as string after command)
	 */
	title: string;
	/**
	 * Name of the category variable (alias is `-n`, title in PascalCase by default)
	 */
	name?: string;
	/**
	 * Custom route for the category (alias is `-r`, parent folder name by default)
	 */
	route?: string;
	/**
	 * Order of the category in sidebar (alias is `-o`, NgDoc sorting categories by name by default)
	 */
	order?: number;
	/**
	 * Provide true if the category is expandable (alias is `-e`, false by default)
	 */
	expandable?: boolean;
	/**
	 * Provide true if the category is expanded by default (alias is `-x`, false by default)
	 */
	expanded?: boolean;
	/**
	 * If parameter was provided, generator will import first parent category automatically (alias is `-c`)
	 */
	category?: boolean;
}
