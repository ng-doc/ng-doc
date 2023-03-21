import {PropertiesSchema} from '@lyrasearch/lyra';

export interface SearchSchema extends PropertiesSchema {
	title: 'string';
	sectionTitle: 'string';
	content: 'string';
}
