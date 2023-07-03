import {SchematicArgv} from '../schematic-argv';

export interface NgDocBuildCategorySchema extends SchematicArgv {
	title: string;
	route?: string;
	order?: number;
	expandable?: boolean;
	expanded?: boolean;
	category?: boolean;
}
