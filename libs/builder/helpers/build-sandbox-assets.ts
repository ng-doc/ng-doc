import {NgDocPageEntity, renderTemplate} from '@ng-doc/builder';
import {
	NgDocDemoConfig,
	NgDocDemoConfigs, NgDocSandbox,
	NgDocSandboxAsset,
	NgDocSandboxConfiguration,
	NgDocSandboxTemplateContext,
} from '@ng-doc/core';
import path from 'path';
import {ClassDeclaration} from 'ts-morph';

import {extractSelectors} from './extract-selectors';

const MAIN_FILES: Record<string, string> = {
	'src/index.html': 'sandbox/index.html.nunj',
	'src/main.ts': 'sandbox/main.ts.nunj',
	'src/styles.scss': 'sandbox/styles.scss.nunj',
	'angular.json': 'sandbox/angular.json.nunj',
	'tsconfig.json': 'sandbox/tsconfig.json.nunj',
}

const DEFAULT_CONFIG: NgDocSandboxConfiguration = {
	stackblitz: {
		files: MAIN_FILES,
	},
	codesandbox: {
		files: {
			...MAIN_FILES,
			'sandbox.config.json': 'sandbox/codesandbox/sandbox.config.json.nunj',
		},
	}
};

/**
 *
 * @param page
 */
export function buildSandboxAssets(page: NgDocPageEntity): Record<string, NgDocSandboxAsset> {
	const demoConfigs: NgDocDemoConfigs = page.demoConfigs;
	const globalConfig: NgDocSandboxConfiguration = page.context.config.sandbox ?? {};
	const pageConfig: NgDocSandboxConfiguration = page.target?.sandbox ?? {};

	return Object.keys(demoConfigs).reduce((assets: Record<string, NgDocSandboxAsset>, clsName: string) => {
		const cls: ClassDeclaration | undefined = page.demoClassDeclarations.find(
			(c: ClassDeclaration) => c.getName() === clsName,
		);
		const config: NgDocDemoConfig = demoConfigs[clsName];
		let componentFiles: Record<string, string> = {};

		if (cls && config) {
			componentFiles = Object.keys(config.files ?? {}).reduce((files: Record<string, string>, file: string) => {
				files[`src/demo/${file}`] = config.files?.[file] ?? '';

				return files;
			}, {});

			assets[clsName] = {
				stackblitz: {
					files: {
						...renderFileTemplates(cls, DEFAULT_CONFIG.stackblitz?.files ?? {}, 'stackblitz'),
						...componentFiles,
						...renderFileTemplates(cls, globalConfig.stackblitz?.files ?? {}, 'stackblitz', path.dirname(page.context.configPath)),
						...renderFileTemplates(cls, pageConfig.stackblitz?.files ?? {}, 'stackblitz', path.dirname(page.sourceFileFolder)),
					},
					dependencies: {
						...DEFAULT_CONFIG.stackblitz?.dependencies,
						...globalConfig.stackblitz?.dependencies,
						...pageConfig.stackblitz?.dependencies,
					}
				},
				codesandbox: {
					files: {
						...renderFileTemplates(cls, DEFAULT_CONFIG.codesandbox?.files ?? {}, 'codesandbox'),
						...componentFiles,
						...renderFileTemplates(cls, globalConfig.codesandbox?.files ?? {}, 'codesandbox', path.dirname(page.context.configPath)),
						...renderFileTemplates(cls, pageConfig.codesandbox?.files ?? {}, 'codesandbox', path.dirname(page.sourceFileFolder)),
					},
					dependencies: {
						...DEFAULT_CONFIG.codesandbox?.dependencies,
						...globalConfig.codesandbox?.dependencies,
						...pageConfig.codesandbox?.dependencies,
					}
				}
			};
		}

		return assets;
	}, {});
}

/**
 *
 * @param cls
 * @param files
 * @param sandbox
 * @param scope
 */
function renderFileTemplates(cls: ClassDeclaration, files: Record<string, string>, sandbox: NgDocSandbox, scope?: string): Record<string, string> {
	const componentName: string = cls.getName() ?? 'unknown-name';
	const componentImportPath: string = `src/demo/${path.basename(cls.getSourceFile().getFilePath(), '.ts')}`

	return Object.keys(files).reduce((result: Record<string, string>, file: string) => {
		const filePath: string = files[file];

		result[file] = renderTemplate<NgDocSandboxTemplateContext>(filePath, {
			scope,
			context: {
				sandbox,
				componentName,
				componentSelector: extractSelectors(cls)[0] ?? 'unknown-selector',
				componentImportPath,
			},
		})

		return result;
	}, {});
}
