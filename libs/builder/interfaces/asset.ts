import {NgDocCodeType} from '@ng-doc/core';

export interface NgDocAsset {
	title: string;
	code: string;
	filePath: string;
	isEmpty: boolean;
	type: NgDocCodeType;
}
