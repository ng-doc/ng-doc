import {BuilderContext} from '@angular-devkit/architect';
import {NgDocStyleType} from '@ng-doc/core';

import {NgDocConfiguration, NgDocSchema} from './schema';

export interface NgDocBuilderContext {
	tsConfig: string;
	config: NgDocConfiguration;
	context: BuilderContext;
	inlineStyleLanguage: NgDocStyleType;
	pagesPaths: string[];
	assetsPath: string;
	buildPath: string;
	apiPath: string;
	guidesPath: string;
}
