import { asArray } from '@ng-doc/core';
import { Element, ElementContent, Root, Text } from 'hast';
import he from 'he';
import { Node as PNode, parser as postHTML } from 'posthtml-parser';

/**
 * Custom parser that converts postHTML nodes to HAST nodes.
 * We can't use `rehypeParse` because it converts attributes to lowercase
 * which leads to issues with Angular bindings.
 * @param document
 * @param options
 */
export default function parsePlugin() {
  // @ts-expect-error - `this` is valid in this context
  Object.assign(this, {Parser: parser})

  /**
   *
   * @param document
   * @param file
   */
  function parser(document: any, file: any): Root {
    const parsed = postHTML(document);

    return {
      type: 'root',
      children: parsed.map(pNodeToHNode)
    }
  }
}

/**
 *
 * @param node
 */
function pNodeToHNode(node: PNode): ElementContent {
  if (typeof node === 'string' || typeof node === 'number') {
    return {
      type: 'text',
      value: he.unescape(String(node)),
    } satisfies Text;
  }

  const classAttr = node.attrs?.['class'] as string | string[] | undefined

  delete node.attrs?.['class'];

  return {
    type: 'element',
    tagName: String(node.tag),
    properties: {
      ...node.attrs,
      className: asArray(classAttr),
    },
    children: asArray(node.content).flat().map(pNodeToHNode),
    position: node.location,
  } satisfies Element;
}
