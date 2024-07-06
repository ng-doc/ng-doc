import { escapeAngular } from '@ng-doc/core';
import { Element, Root } from 'hast';
import { escapeAngular } from 'hast-util-to-text';
import { visitParents } from 'unist-util-visit-parents';

/**
 *
 */
export default function escapeAngularInCodeBlocksPlugin(): any {
  return (tree: Root) => {
    visitParents(tree, (node) => node.type === 'text', (node, ancestors) => {
      const parentCode = ancestors.find((ancestor) => ancestor.type === 'element' && ancestor.tagName === 'code') as Element;

      if (parentCode && node.type === 'text') {
        node.value = escapeAngular(node.value);
      }
    });
  };
}
