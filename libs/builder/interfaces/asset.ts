import {NgDocCodeType} from '../types';

export interface NgDocAsset {
	originalPath: string;
	outputPath: string;
	name: string;
	output: string;
	title: string;
	type: NgDocCodeType;
}
