import { Root } from 'hast';
import { SKIP,visit } from 'unist-util-visit';

export default function unescapeOpenTag(): any {
  return (tree: Root) => {
    visit(
      tree,
      (node) => ['text', 'element'].includes(node.type),
      (node) => {
        if (node.type === 'element' && node.tagName === 'code') {
          return SKIP;
        }

        if (node.type === 'text') {
          node.value = node.value.replace(/&lt;/g, '<');
        }

        return undefined;
      },
    );
  };
}
