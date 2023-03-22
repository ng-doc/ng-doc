import {Document} from '@orama/orama/dist/types';

export interface SearchSchema extends Document {
	sectionTitle: 'string';
	content: 'string';
}
