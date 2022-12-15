import {BuilderContext} from '@angular-devkit/architect';
import {json} from '@angular-devkit/core';
import * as path from 'path';

import {GENERATED_ASSETS_PATH} from '../engine';
import {NgDocBuilderContext, NgDocSchema} from '../interfaces';
import {NgDocStyleType} from '../types';

/**
 *
 * @param targetOptions
 * @param options
 * @param context
 */
export function createBuilderContext(targetOptions: json.JsonObject, options: NgDocSchema, context: BuilderContext): NgDocBuilderContext {
	const buildPath: string = path.join(context.workspaceRoot, '.ng-doc', context.target?.project ?? 'app');

	return {
		tsConfig: String(targetOptions['tsConfig']),
		options,
		context,
		inlineStyleLanguage: (targetOptions?.['inlineStyleLanguage'] as NgDocStyleType) ?? 'CSS',
		assetsPath: GENERATED_ASSETS_PATH,
		buildPath,
		apiPath: path.join(buildPath, 'api'),
		modulesPath: path.join(buildPath, 'modules'),
	}
}
