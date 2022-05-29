import {BuilderContext} from '@angular-devkit/architect';

import {NgDocSchema} from './schema';

export interface NgDocBuilderContext {
	options: NgDocSchema;
	context: BuilderContext;
}
