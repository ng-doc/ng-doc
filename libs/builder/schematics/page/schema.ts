import {SchematicArgv} from '../schematic-argv';

export interface NgDocBuildPageSchema extends SchematicArgv {
	title: string;
	route?: string;
	order?: number;
	demo?: boolean;
	category?: boolean;
}
