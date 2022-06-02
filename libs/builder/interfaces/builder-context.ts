import {BuilderContext} from '@angular-devkit/architect';

import {NgDocStyleType} from '../types';
import {NgDocSchema} from './schema';

export interface NgDocBuilderContext {
	options: NgDocSchema;
	context: BuilderContext;
	inlineStyleLanguage: NgDocStyleType;
}
