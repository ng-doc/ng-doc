import { NG_DOC_ELEMENT } from '@ng-doc/core';
import { NgDocKeyword, NgDocKeywordLanguage } from '@ng-doc/core';
import { KEYWORD_ALLOWED_LANGUAGES } from '@ng-doc/core';
import { Element, Text } from 'hast';
import { isElement } from 'hast-util-is-element';
import { toString } from 'hast-util-to-string';
import { SKIP, visitParents } from 'unist-util-visit-parents';

import { hasLinkAncestor, isCodeNode } from '../helpers';

const ALWAYS_ALLOWED_LANGUAGES: string[] = ['typescript', 'ts', 'angular-ts'];
const LANGUAGES: string[] = ['typescript', 'ts', 'angular-ts', ...KEYWORD_ALLOWED_LANGUAGES];
const SPLIT_REGEXP: RegExp = /([*A-Za-z0-9_$@-]+(?:[.#][A-Za-z0-9_-]+)?(?:\?[\w=&]+)?)/;
const MATCH_KEYWORD_REGEXP: RegExp =
  /(?<key>[*A-Za-z0-9_$@-]+)((?<delimiter>[.#])(?<anchor>[A-Za-z0-9_-]+))?(?<queryParams>\?[\w=&]+)?/;

export type AddKeyword = (keyword: string) => void;
export type GetKeyword = (keyword: string) => NgDocKeyword | undefined;

interface Config {
  addUsedKeyword?: AddKeyword;
  getKeyword?: GetKeyword;
}

/**
 *
 * @param config
 */
export default function keywordsPlugin(config: Config) {
  return (tree: Element) =>
    visitParents(tree, 'element', (node: Element, ancestors: Element[]) => {
      if (!isCodeNode(node)) {
        return;
      }

      const isInlineCode: boolean = !isElement(ancestors[ancestors.length - 1], 'pre');
      const lang = ancestors[ancestors.length - 1].properties?.['language']?.toString() ?? '';

      if (isInlineCode || LANGUAGES.includes(lang)) {
        visitParents(node, 'text', (node: Text, ancestors: Element[]) => {
          if (hasLinkAncestor(ancestors)) {
            return;
          }

          const parent: Element = ancestors[ancestors.length - 1];
          const index: number = parent.children.indexOf(node);

          // Parse the text for words that we can convert to links
          const nodes: any[] = getNodes(node, parent, isInlineCode, config, lang);
          // Replace the text node with the links and leftover text nodes
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          Array.prototype.splice.apply(parent.children, [index, 1].concat(nodes));
          // Do not visit this node's children or the newly added nodes
          return [SKIP, index + nodes.length];
        });
      }
    });
}

/**
 *
 * @param node
 * @param parent
 * @param isInlineCode
 * @param config
 * @param language
 */
function getNodes(
  node: Text,
  parent: Element,
  isInlineCode: boolean,
  config: Config,
  language: string,
): Array<Element | Text> {
  const { addUsedKeyword, getKeyword } = config;

  return toString(node)
    .split(SPLIT_REGEXP)
    .map((word: string) => {
      const match = word.match(MATCH_KEYWORD_REGEXP);

      if (!match) {
        return { type: 'text', value: word };
      }

      const {
        key = '',
        delimiter = '',
        anchor = '',
        queryParams = '',
      } = match.groups as { key: string; delimiter: string; anchor: string; queryParams: string };
      const usedKeyword = `${key}${delimiter}${anchor?.toLowerCase()}`;
      const rootKeyword = getKeyword?.(key);
      const keyword = getKeyword?.(usedKeyword);
      const isGuideKeyword = key.startsWith('*');
      const isLanguageAllowed =
        (!keyword?.languages && ALWAYS_ALLOWED_LANGUAGES.includes(language)) ||
        !!keyword?.languages?.includes(language as NgDocKeywordLanguage);

      // If language of code block is not allowed, return the word as is
      if (!isInlineCode && keyword && !isLanguageAllowed) {
        return { type: 'text', value: word };
      }

      addUsedKeyword?.(usedKeyword);

      const notFoundGuideKeyword: boolean = isGuideKeyword && !keyword;
      const notFoundApiAnchorKeyword: boolean = !!rootKeyword && !!anchor && !keyword;

      if (getKeyword && isInlineCode && (notFoundGuideKeyword || notFoundApiAnchorKeyword)) {
        // TODO: Enabled
        // throw new Error(`Route with keyword "${word}" is missing.`);
      }

      // Convert code tag to a link tag or highlight it with a class
      if (parent.properties) {
        if (isInlineCode && keyword?.type === 'link') {
          parent.tagName = 'a';
          parent.properties = {
            href: `${keyword.path}${queryParams ?? ''}`,
            className: [NG_DOC_ELEMENT],
          };

          return { type: 'text', value: keyword.title };
        } else if (isInlineCode && keyword) {
          parent.properties['className'] = [NG_DOC_ELEMENT, 'ng-doc-code-with-link'];
        }
      }

      // Add link inside the code if it's a link to the API entity
      return keyword
        ? createLinkNode(
            isInlineCode ? keyword.title : word,
            keyword.path,
            keyword.type,
            keyword.description,
          )
        : { type: 'text', value: word };
    });
}

/**
 *
 * @param text
 * @param href
 * @param type
 * @param description
 */
function createLinkNode(text: string, href: string, type?: string, description?: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      href: href,
      class: ['ng-doc-code-anchor', NG_DOC_ELEMENT],
      'data-link-type': type,
      ngDocTooltip: description,
    },
    children: [{ type: 'text', value: text }],
  };
}
