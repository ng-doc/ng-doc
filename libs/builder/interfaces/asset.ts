import {NgDocCodeType} from '@ng-doc/core';

export interface NgDocAsset {
	originalPath: string;
	outputPath: string;
	name: string;
	code: string;
	output: string;
	title: string;
	type: NgDocCodeType;
}
