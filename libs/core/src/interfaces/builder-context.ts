import {NgDocSchema} from './schema';
import {BuilderContext} from '@angular-devkit/architect';

export interface NgDocBuilderContext {
  options: NgDocSchema;
  context: BuilderContext;
}
