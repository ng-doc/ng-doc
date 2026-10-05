import {
  asArray,
  KEYWORD_ALLOWED_LANGUAGES,
  NG_DOC_ELEMENT,
  NgDocKeyword,
  NgDocKeywordLanguage,
} from '@ng-doc/core';
import { Element, Text } from 'hast';
import { isElement } from 'hast-util-is-element';
import { toString } from 'hast-util-to-string';
import { SKIP, visitParents } from 'unist-util-visit-parents';

import { hasLinkAncestor, isCodeNode } from '../helpers';
import { CodeScan, scanCodeBlock, scanInlineCode, WordPosition } from './keyword-positions';

const ALWAYS_ALLOWED_LANGUAGES: string[] = ['typescript', 'ts', 'angular-ts'];
const HTML_LANGUAGES: string[] = [...KEYWORD_ALLOWED_LANGUAGES];
const LANGUAGES: string[] = [...ALWAYS_ALLOWED_LANGUAGES, ...HTML_LANGUAGES];
const SPLIT_REGEXP: RegExp = /([*\p{L}\w$@-]+(?:[.#][\p{L}\w-]+)?(?:\?[\w=&]+)?)/u;
const MATCH_KEYWORD_REGEXP: RegExp =
  /(?<key>[*\p{L}\w$@-]+)((?<delimiter>[.#])(?<anchor>[\p{L}\w-]+))?(?<queryParams>\?[\w=&]+)?/u;

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
      const lang =
        asArray((node.properties?.['className'] as string[]) ?? [])
          .find((className) => className.startsWith('language-'))
          ?.replace('language-', '') ?? '';

      if (!isInlineCode && !LANGUAGES.includes(lang)) {
        return;
      }

      const offsets: Map<Text, number> = textOffsets(node);
      const text: string = Array.from(offsets.keys())
        .map((textNode: Text) => textNode.value)
        .join('');
      const scan: CodeScan | undefined = isInlineCode
        ? scanInlineCode(text)
        : scanCodeBlock(text, HTML_LANGUAGES.includes(lang) ? 'html' : 'typescript');

      if (!scan) {
        return;
      }

      visitParents(node, 'text', (node: Text, ancestors: Element[]) => {
        if (hasLinkAncestor(ancestors)) {
          return;
        }

        const parent: Element = ancestors[ancestors.length - 1];
        const index: number = parent.children.indexOf(node);

        // Parse the text for words that we can convert to links
        const nodes: any[] = getNodes(
          node,
          parent,
          isInlineCode,
          config,
          lang,
          scan,
          offsets.get(node) ?? 0,
        );
        // Replace the text node with the links and leftover text nodes
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        Array.prototype.splice.apply(parent.children, [index, 1].concat(nodes));
        // Do not visit this node's children or the newly added nodes
        return [SKIP, index + nodes.length];
      });
    });
}

/**
 * The offset of every text node of a code element in the element's text, in document order.
 * @param node - The code element.
 */
function textOffsets(node: Element): Map<Text, number> {
  const offsets = new Map<Text, number>();
  let offset = 0;

  visitParents(node, 'text', (text: Text) => {
    offsets.set(text, offset);
    offset += text.value.length;
  });

  return offsets;
}

/**
 *
 * @param node
 * @param parent
 * @param isInlineCode
 * @param config
 * @param language
 * @param scan - The positions of the code element's words.
 * @param offset - The offset of the text node in the code element's text.
 */
function getNodes(
  node: Text,
  parent: Element,
  isInlineCode: boolean,
  config: Config,
  language: string,
  scan: CodeScan,
  offset: number,
): Array<Element | Text> {
  const { addUsedKeyword, getKeyword } = config;
  let start: number = offset;

  return toString(node)
    .split(SPLIT_REGEXP)
    .map((word: string) => {
      const wordStart: number = start;
      start += word.length;

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
      const position: WordPosition = scan.position(wordStart, wordStart + word.length, key);

      // Not a reference to a keyword: an object key, a string, a file name and the like
      if (!position.link) {
        return { type: 'text', value: word };
      }

      // A member after a dot is looked up as a whole `Owner.member`
      const isMember: boolean = position.keyword !== undefined;
      const usedKeyword = position.keyword ?? `${key}${delimiter}${anchor?.toLowerCase()}`;
      const rootKeyword = isMember ? undefined : getKeyword?.(key);
      const keyword = getKeyword?.(usedKeyword);
      const isGuideKeyword = key.startsWith('*');
      const isLanguageAllowed =
        (!keyword?.languages && ALWAYS_ALLOWED_LANGUAGES.includes(language)) ||
        !!keyword?.languages?.includes(language as NgDocKeywordLanguage);

      // If language of code block is not allowed, return the word as is
      if (!isInlineCode && keyword && !isLanguageAllowed) {
        return { type: 'text', value: word };
      }

      // If the keyword is just an asterisk, return the word as is
      if (isGuideKeyword && key.length === 1) {
        return { type: 'text', value: word };
      }

      addUsedKeyword?.(usedKeyword);

      const notFoundGuideKeyword: boolean = isGuideKeyword && !keyword;
      const notFoundApiAnchorKeyword: boolean = !!rootKeyword && !!anchor && !keyword;

      // Only inline code that is one keyword reference as a whole fails on a missing one: in code,
      // `*` and `.` are operators, not keyword syntax.
      if (getKeyword && scan.whole && (notFoundGuideKeyword || notFoundApiAnchorKeyword)) {
        throw new Error(`Route with keyword "${word}" is missing.`);
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
            isInlineCode && !isMember ? keyword.title : word,
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
