import { BuilderContext } from '@angular-devkit/architect';
import { json } from '@angular-devkit/core';
import { asArray, NgDocStyleType } from '@ng-doc/core';
import * as path from 'path';

import { NgDocBuilderContext, NgDocConfiguration } from '../interfaces';
import { loadConfig } from './load-config';

/**
 * Creates builder context, with all the necessary information for the builder to work
 * @param targetOptions - Target options
 * @param context - Builder context
 * @param configFilePath - Path to the configuration file if it exists
 */
export function createBuilderContext(
	targetOptions: json.JsonObject,
	context: BuilderContext,
	configFilePath?: string,
): NgDocBuilderContext {
	const projectRoot: string = path.dirname(targetOptions['browser'] as string);
	const [configPath, config]: [string, NgDocConfiguration] = loadConfig(
		configFilePath ?? projectRoot,
		!configFilePath,
	);
	const buildPath: string = path.join(
		context.workspaceRoot,
		config.outDir ?? '',
		'.ng-doc',
		context.target?.project ?? 'app',
	);

	return {
		tsConfig: config?.tsConfig ?? String(targetOptions['tsConfig']),
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
