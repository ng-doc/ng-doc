import {NgDocAngularEntities, NgDocDeclarations} from '@ng-doc/core';
import {Node} from 'ts-morph';

import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocKeywordType} from '../types';
import {isApiPageEntity, isPageEntity} from './entity-type';

/**
 *
 * @param entity
 */
export function getKeywordTypeFromEntity(entity: NgDocRouteEntity): NgDocKeywordType | undefined {
	if (isApiPageEntity(entity)) {
		if (Node.isClassDeclaration(entity.declaration)) {
			for (const decorator of NgDocAngularEntities) {
				if (entity.declaration.getDecorator(decorator)) {
					return decorator;
				}
			}

			return 'Class';
		}

		for (const declaration of NgDocDeclarations) {
			if (entity.declaration?.getKindName().includes(declaration)) {
				return declaration;
			}
		}

		return 'api';
	}

	if (isPageEntity(entity)) {
		return 'guideline';
	}

	return undefined;
}
