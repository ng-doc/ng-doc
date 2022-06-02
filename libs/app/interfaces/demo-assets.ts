import {NgDocCodeType} from '@ng-doc/app/types';

export interface NgDocDemoAssets {
	[name: string]: NgDocDemoAsset[];
}

export interface NgDocDemoAsset {
	codeType: NgDocCodeType;
	code: string;
	title: string;
}
