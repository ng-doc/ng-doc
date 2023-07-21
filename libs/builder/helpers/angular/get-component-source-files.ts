import {Component} from '@angular/core';
import {asArray} from '@ng-doc/core';
import path from 'path';
import {ClassDeclaration} from 'ts-morph';

import {getComponentDecorator} from './get-component-decorator';

/**
 * Returns an array of source files for a component.
 *
 * @param cls - Class declaration.
 */
export function getComponentSourceFiles(cls: ClassDeclaration): string[] {
	const decoratorData: Component | undefined = getComponentDecorator(cls);

	if (decoratorData) {
		const filePath: string = cls.getSourceFile().getFilePath();
		const fileDir: string = path.dirname(filePath);

		return asArray(
			filePath,
			decoratorData.templateUrl ? path.join(fileDir, decoratorData.templateUrl) : [],
			asArray(decoratorData.styleUrls).map((styleUrl: string) => path.join(fileDir, styleUrl)),
		)
	}

	return [];
}
