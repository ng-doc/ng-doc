import {NgDocPlaygroundProperties} from '@ng-doc/core';
import {ClassDeclaration, JSDoc, PropertyDeclaration, Type} from 'ts-morph';

import {displayType} from './typescript';

/**
 *
 * @param declaration
 */
export function declarationToPlayground(declaration: ClassDeclaration): NgDocPlaygroundProperties {
	return declaration
		.getProperties()
		.filter((property: PropertyDeclaration) => !!property.getDecorator('Input'))
		.reduce((properties: NgDocPlaygroundProperties, property: PropertyDeclaration) => {
			const inputName: string =
				property
					.getDecorator('Input')
					?.getArguments()[0]
					?.getText()
					.replace(/^["']|['"]$/g, '') ?? property.getName();

			properties[inputName] = {
				name: property.getName(),
				type: displayType(property.getType()),
				default: property.getInitializer()?.getText(),
				description: property
					.getJsDocs()
					.reduce((comment: string, doc: JSDoc) => `${comment}\n${doc.getCommentText()}`.trim(), ''),
				options: property
					.getType()
					.getUnionTypes()
					.map((type: Type) => type.getText()),
			};

			return properties;
		}, {});
}
