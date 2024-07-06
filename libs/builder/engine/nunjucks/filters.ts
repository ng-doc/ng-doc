/* Just re-export filters from this file, they will be included to the template renderer automatically */
import { UTILS } from '../../helpers';

export {
  accessorPresentation,
  constructorPresentation,
  declarationImport,
  displayReturnType,
  displayType,
  excludeByJsDocTags,
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
  getJsDocDescription,
  getJsDocParam,
  getJsDocTag,
  getJsDocTags,
  getMemberParent,
  getMethodChain,
  getOverriddenMember,
  getPropertyChain,
  groupAccessors,
  hasJsDocTag,
  methodPresentation,
  noEmpty,
  noLineBreaks,
  notEmptyAssets,
  sortByNodesName,
  sortNavigationEntries,
  toTemplateString,
  typeAliasPresentation,
  variablePresentation,
} from '../../helpers';
export { createImportPath } from '../builders/helpers';
export { isRoute, kebabCase, objectKeys, unique } from '@ng-doc/core';

export const markdownToHtml: typeof UTILS.markdownToHtml = (markdown: string) =>
  UTILS.markdownToHtml(markdown);
