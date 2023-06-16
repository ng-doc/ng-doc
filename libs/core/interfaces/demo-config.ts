import {NgDocCodeType} from '../types/code-type';

export interface NgDocDemoConfigs {
	[name: string]: NgDocDemoConfig;
}

export interface NgDocDemoConfig {
	files?: Record<string, string>;
	assets: NgDocDemoAsset[];
}

export interface NgDocDemoAsset {
	title: string;
	code: string;
	codeType: NgDocCodeType;
	filePath: string;
	isEmpty?: boolean;
}
