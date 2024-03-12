import { BuilderContext } from '@angular-devkit/architect';
import { NgDocStyleType } from '@ng-doc/core';
import { Project } from 'ts-morph';

import { NgDocConfiguration } from './configuration';

export interface NgDocBuilderContext {
  tsConfig: string;
  project: Project;
  config: NgDocConfiguration;
  context: BuilderContext;
  inlineStyleLanguage: NgDocStyleType;
  cachedFiles: string[];
  docsPath: string;
  outDir: string;
  outApiDir: string;
  outGuidesDir: string;
  outAssetsDir: string;
}
