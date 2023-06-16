/* Just re-export filters from this file, they will be included to the template renderer automatically */

import * as path from 'path';

export {
	accessorPresentation,
	constructorPresentation,
	declarationImport,
	displayReturnType,
	displayType,
	extractDocs,
	extractParameterDocs,
	extractSeeDocs,
	extractSelectors,
	filterByScope,
	filterByStatic,
	filterUselessMembers,
	firstNodeWithComment,
	functionPresentation,
	getAccessorChain,
	getClassAccessors,
	getClassMethods,
	getClassProperties,
	getDeclarationType,
	getImplementedMember,
	getInheritedParent,
	getInterfaceAccessors,
	getInterfaceMethods,
	getInterfaceProperties,
	getMemberParent,
	getMethodChain,
	getOverriddenMember,
	getPropertyChain,
	groupAccessors,
	marked,
	methodPresentation,
	noEmpty,
	noLineBreaks,
	sortByNodesName,
	sortNavigationEntities,
	toTemplateString,
	typeAliasPresentation,
	variablePresentation,
} from '../../helpers';
export {kebabCase, objectKeys, unique} from '@ng-doc/core';

/**
 *
 * @param target
 * @param base
 */
export function relativeTo(target: string, base: string): string {
	return path.relative(base, target);
}
