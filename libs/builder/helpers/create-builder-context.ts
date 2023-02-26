import {BuilderContext} from '@angular-devkit/architect';
import {json} from '@angular-devkit/core';
import {asArray, NgDocStyleType} from '@ng-doc/core';
import * as path from 'path';

import {NgDocBuilderContext, NgDocSchema} from '../interfaces';

/**
 *
 * @param targetOptions
 * @param options
 * @param context
 * @param project
 */
export function createBuilderContext(
	targetOptions: json.JsonObject,
	options: NgDocSchema,
	context: BuilderContext,
): NgDocBuilderContext {
	const buildPath: string = path.join(context.workspaceRoot, '.ng-doc', context.target?.project ?? 'app');

	return {
		tsConfig: options.ngDoc?.tsConfig ?? String(targetOptions['tsConfig']),
		options,
		context,
		inlineStyleLanguage: (targetOptions?.['inlineStyleLanguage'] as NgDocStyleType) ?? 'CSS',
		pagesPaths: options.ngDoc?.pages?.length ? asArray(options.ngDoc?.pages) : [path.dirname(options.main)],
		assetsPath: path.join(buildPath, 'assets'),
		buildPath,
		apiPath: path.join(buildPath, 'api'),
		guidesPath: path.join(buildPath, 'guides'),
	};
}
