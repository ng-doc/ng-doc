import {BuilderContext} from '@angular-devkit/architect';

import {NgDocStyleType} from '../types';
import {NgDocSchema} from './schema';

export interface NgDocBuilderContext {
	tsConfig: string;
	options: NgDocSchema;
	context: BuilderContext;
	inlineStyleLanguage: NgDocStyleType;
}
