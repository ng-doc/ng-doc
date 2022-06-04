import {NgDocCodeType} from '@ng-doc/builder';

export interface NgDocDemoAssets {
	[name: string]: NgDocDemoAsset[];
}

export interface NgDocDemoAsset {
	codeType: NgDocCodeType;
	code: string;
	title: string;
}
