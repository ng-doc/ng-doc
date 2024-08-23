import { Element, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

/**
 * Plugin to transform mermaid code blocks into mermaid elements that are going to be rendered by the mermaid processor.
 * @param tree
 * @param headings
 */
export default function mermaidPlugin(): any {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'pre') {
        const codeNode = node.children[0] as Element;

        if (codeNode.tagName === 'code' && codeNode.properties?.['lang'] === 'mermaid') {
          node.properties = { className: 'mermaid' };
          node.children = [
            {
              type: 'text',
              value: toString(codeNode),
            },
          ];
        }
      }
    });
  };
}
