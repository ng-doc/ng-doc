import {BuilderContext} from '@angular-devkit/architect';
import {json} from '@angular-devkit/core';
import {asArray, NgDocStyleType} from '@ng-doc/core';
import * as path from 'path';

import {NgDocBuilderContext, NgDocConfiguration, NgDocSchema} from '../interfaces';
import {loadConfig} from './load-config';

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
	const projectRoot: string = path.dirname(targetOptions['main'] as string);
	const [configPath, config]: [string, NgDocConfiguration] = loadConfig(projectRoot);
	const buildPath: string = path.join(context.workspaceRoot, config.outDir ?? '', '.ng-doc', context.target?.project ?? 'app');

	return {
		tsConfig: config?.tsConfig ?? String(targetOptions['tsConfig']),
		configPath,
		config,
		context,
		inlineStyleLanguage: (targetOptions?.['inlineStyleLanguage'] as NgDocStyleType) ?? 'CSS',
		pagesPaths: config.pages?.length ? asArray(config.pages) : [projectRoot],
		assetsPath: path.join(buildPath, 'assets'),
		cachedFiles: [configPath],
		buildPath,
		apiPath: path.join(buildPath, 'api'),
		guidesPath: path.join(buildPath, 'guides'),
	};
}
