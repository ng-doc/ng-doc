import {ClassDeclaration, JSDoc, PropertyDeclaration, Type} from 'ts-morph';

import {NgDocPlaygroundProperties} from '../interfaces';

/**
 *
 * @param declaration
 */
export function declarationToPlayground(declaration: ClassDeclaration): NgDocPlaygroundProperties {
	return declaration
		.getProperties()
		.filter((property: PropertyDeclaration) => !!property.getDecorator('Input'))
		.reduce((properties: NgDocPlaygroundProperties, property: PropertyDeclaration) => {
			properties[property.getName()] = {
				type: property.getType().getText(),
				default: property.getInitializer()?.getText(),
				description: property
					.getJsDocs()
					.reduce((comment: string, doc: JSDoc) => `${comment}\n${doc.getCommentText()}`.trim(), ''),
				options: property.getType().getUnionTypes().map((type: Type) => type.getText()),
			};

			return properties;
		}, {});
}
