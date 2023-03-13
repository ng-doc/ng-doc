import {NG_DOC_ELEMENT} from '@ng-doc/core/constants/defaults';
import {asArray} from '@ng-doc/core/helpers/as-array';

const visit = require('unist-util-visit');

/**
 *
 * @param tree
 * @param headings
 */
export default function markElements(): any {
	return (tree: any) => {
		visit(tree, 'element', (node: any) => {
			node.properties.className = [...asArray(node.properties.className), NG_DOC_ELEMENT];
		});
	};
}
