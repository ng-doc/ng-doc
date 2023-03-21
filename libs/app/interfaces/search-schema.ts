import {PropertiesSchema} from '@lyrasearch/lyra';

export interface SearchSchema extends PropertiesSchema {
	breadcrumbs: 'string';
	title: 'string';
	sectionTitle: 'string';
	content: 'string';
}
