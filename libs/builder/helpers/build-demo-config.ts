import {Component} from '@angular/core';
import {asArray, NgDocDemoAsset, NgDocDemoConfigs, NgDocStyleType} from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import {ClassDeclaration} from 'ts-morph';

import {renderTemplate} from '../engine/nunjucks';
import {getComponentDecorator} from './angular';
import {buildDemoAssets} from './build-demo-assets';
import {formatCode} from './format-code';
import {slash} from './slash';

/**
 *
 * @param classDeclaration
 * @param inlineStyleLang
 * @param outDir
 */
export function buildDemoConfig(
	classDeclaration: ClassDeclaration,
	inlineStyleLang: NgDocStyleType,
): NgDocDemoConfigs {
	const decorator: Component | undefined = getComponentDecorator(classDeclaration);

	if (decorator) {
		const filePath: string = classDeclaration.getSourceFile().getFilePath();
		const fileDir: string = path.dirname(filePath);
		const filePaths: string[] = [
			filePath,
			...asArray(decorator.templateUrl, decorator.styleUrls).map((p: string) => path.join(fileDir, p)),
		];

		const files: Record<string, string> = filePaths.reduce(
			(acc: Record<string, string>, file: string) => ({
				...acc,
				[slash(path.relative(fileDir, file))]: fs.readFileSync(file, 'utf-8'),
			}),
			{},
		);

		const assets: NgDocDemoAsset[] = filePaths.map((file: string) => buildDemoAssets(file, inlineStyleLang)).flat();

		return {
			[classDeclaration.getName() ?? '']: {
				files,
				assets: assets.map((asset: NgDocDemoAsset, i: number) => {
					const code: string = formatCode(asset.code, asset.codeType).trim();

					return {
						...asset,
						isEmpty: !code,
						code: renderTemplate('./code.html.nunj', {
							context: {
								code,
								lang: asset.codeType,
							},
						}).trim(),
					};
				}),
			},
		};
	}

	return {};
}
