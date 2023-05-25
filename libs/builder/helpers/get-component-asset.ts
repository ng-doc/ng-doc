import {Component} from '@angular/core';
import {asArray, NgDocStyleType} from '@ng-doc/core';
import * as path from 'path';
import {ClassDeclaration, Decorator, Node} from 'ts-morph';

import {NgDocRenderer} from '../engine/renderer';
import {NgDocAsset} from '../interfaces';
import {componentDecoratorResolver} from '../resolvers/component-decorator.resolver';
import {NgDocComponentAsset} from '../types';
import {buildAssets} from './build-assets';
import {formatCode} from './format-code';
import {slash} from './slash';

/**
 *
 * @param classDeclaration
 * @param inlineStyleLang
 * @param outDir
 */
export function getComponentAsset(
	classDeclaration: ClassDeclaration,
	inlineStyleLang: NgDocStyleType,
	outDir: string,
): NgDocComponentAsset {
	const decorator: Decorator | undefined = classDeclaration.getDecorator('Component');
	const decoratorArgument: Node | undefined = decorator?.getArguments()[0];

	if (Node.isObjectLiteralExpression(decoratorArgument)) {
		const decoratorData: Component = componentDecoratorResolver(decoratorArgument);
		const filePath: string = classDeclaration.getSourceFile().getFilePath();
		const fileDir: string = path.dirname(filePath);

		const assets: Array<Omit<NgDocAsset, 'outputPath'>> = [
			// Add assets for the component file
			...buildAssets(filePath, inlineStyleLang),
			// Add assets for the template file if it exists
			...(decoratorData.templateUrl ? buildAssets(path.join(fileDir, decoratorData.templateUrl), inlineStyleLang) : []),
			// Add assets for the style files if they exist
			...asArray(decoratorData.styleUrls)
				.map((styleUrl: string) => buildAssets(path.join(fileDir, styleUrl), inlineStyleLang))
				.flat(),
		];

		return {
			[classDeclaration.getName() ?? '']: assets.map((asset: Omit<NgDocAsset, 'outputPath'>, i: number) => {
				const code: string = formatCode(asset.output, asset.type);

				return {
					...asset,
					code,
					output: new NgDocRenderer()
						.renderSync('./code.html.nunj', {
							context: {
								code,
								lang: asset.type,
							},
						})
						.trim(),
					outputPath: slash(path.join(outDir, classDeclaration.getName() ?? '', asset.type, `${asset.name}${i}.html`)),
				};
			}),
		};
	}

	return {};
}
