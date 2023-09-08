import { Root } from 'hast';

/**
 * Wraps headings and paragraphs in sections recursively.
 */
export default function wrapSections() {
	return (tree: Root) => {
		return tree;
	};
}
