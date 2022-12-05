import {NgDocGlobalKeyword} from './keyword-map';

export interface NgDocSchema {
	browserTarget: string;
	ngDoc: {
		pages: string[];
		tag: string;
		keywords?: Record<string, NgDocGlobalKeyword>;
		defaultRoute?: string;
	};
}
