// @ts-nocheck
import {NgDocDemoAssets} from '@ng-doc/app';
import Asset8 from '!!raw-loader!Asset8';
import Asset9 from '!!raw-loader!Asset9';
import Asset10 from '!!raw-loader!Asset10';
import Asset11 from '!!raw-loader!Asset11';
import Asset12 from '!!raw-loader!Asset12';

export const demoAssets: NgDocDemoAssets = {
	InlineDemoComponent: [
		{title: 'Test1', codeType: 'TypeScript', code: Asset8},
		{title: 'Test2', codeType: 'TypeScript', code: Asset9},
		{title: 'ONINIT', codeType: 'TypeScript', code: Asset10},
	],
	DemoWithFilesComponent: [
		{title: 'TypeScript', codeType: 'TypeScript', code: Asset11},
		{title: 'HTML', codeType: 'HTML', code: Asset12},
	],
};

export default demoAssets;
