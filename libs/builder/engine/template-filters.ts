/* Just export filters from this file, they will be included to the template renderer automatically */

export {
	displayType,
	extractDocs,
	extractParameterDocs,
	extractSeeDocs,
	extractSelectors,
	filterByScope,
	filterByStatic,
	marked,
	methodPresentation,
	noEmpty,
	noLineBreaks,
	notEmptyAssets,
	typeAliasPresentation,
	variablePresentation,
} from '../helpers';
export {humanizeDeclarationName} from '@ng-doc/core';
