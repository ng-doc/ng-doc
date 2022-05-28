import {json} from '@angular-devkit/core';

export interface NgDocSchema extends json.JsonObject {
	browserTarget: string;
	ngDoc: {
		pages: string | string[];
		sources: string[];
		tsConfig: string;
	};
}
