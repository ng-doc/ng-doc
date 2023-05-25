import {BuilderContext} from '@angular-devkit/architect';
import {NgDocStyleType} from '@ng-doc/core';

import {NgDocConfiguration} from './configuration';

export interface NgDocBuilderContext {
	tsConfig: string;
	config: NgDocConfiguration;
	context: BuilderContext;
	inlineStyleLanguage: NgDocStyleType;
	cachedFiles: string[];
	pagesPaths: string[];
	assetsPath: string;
	buildPath: string;
	apiPath: string;
	guidesPath: string;
}
