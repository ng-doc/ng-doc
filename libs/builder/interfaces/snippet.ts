import {NgDocSnippetType} from '../types';

export interface NgDocSnippet {
	content: string;
	name?: string;
	type: NgDocSnippetType;
}
