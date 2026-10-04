import { NgDocHeading, NgDocPageAnchor, NgDocScopedKeyword } from '@ng-doc/core';
import GithubSlugger from 'github-slugger';
import { Element, Root, Text } from 'hast';
import { hasProperty } from 'hast-util-has-property';
import { headingRank } from 'hast-util-heading-rank';
import { isElement } from 'hast-util-is-element';
import { toString } from 'hast-util-to-string';
import { visitParents } from 'unist-util-visit-parents';

import { attrValue } from '../helpers';

/**
 *
 * @param tree
 * @param addAnchor
 * @param headings
 */
export default function sluggerPlugin(
  addAnchor?: (anchor: NgDocPageAnchor) => void,
  headings: NgDocHeading[] = ['h1', 'h2', 'h3', 'h4'],
) {
  if (!addAnchor) {
    return () => {};
  }

  const slugger: GithubSlugger = new GithubSlugger();

  return (tree: Root) => {
    slugger.reset();

    visitParents(tree, 'element', (node: Element, ancestors) => {
      const scope = getKeywordScope(ancestors);

      const isHeading =
        !!headingRank(node) &&
        !hasProperty(node, 'id') &&
        !!headings?.includes(node.tagName.toLowerCase() as NgDocHeading);
      const attrSlug: string | undefined = attrValue(node, 'dataSlug');
      const attrSlugTitle: string | undefined = attrValue(node, 'dataSlugTitle');
      const attrSlugType: string | undefined = attrValue(node, 'dataSlugType');
      const dataToSlug: string | undefined = isHeading ? toString(node).trim() : attrSlug;

      if (dataToSlug) {
        if (node.properties) {
          const id: string =
            attrSlug && attrSlugType === 'member' ? attrSlug : slugger.slug(dataToSlug);

          node.properties['id'] = id;

          if (isHeading) {
            hideLeadingEmoji(node);
          }

          addAnchor({
            anchorId: id,
            anchor: new GithubSlugger().slug(dataToSlug),
            title: attrSlugTitle || dataToSlug,
            scope,
            type:
              (isHeading && attrSlugType !== 'member') || (attrSlug && attrSlugType === 'heading')
                ? 'heading'
                : 'member',
          });
        }
      }
    });
  };
}

/**
 * A leading emoji of a heading: one pictograph with its modifiers and joined parts, or a flag.
 * `libs/builder/helpers/keyword-heading-title.ts` strips the same emoji from keyword titles; keep
 * both patterns in step.
 */
const LEADING_EMOJI: RegExp =
  /^(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*)(?=\s)/u;

/**
 * Wraps a decorative leading emoji of a heading in an `aria-hidden` span, so screen readers skip
 * it. It runs after the heading's id and anchor are taken from the text, so neither changes.
 * @param heading - The heading element.
 */
function hideLeadingEmoji(heading: Element): void {
  const first = heading.children[0];
  const emoji = first?.type === 'text' ? LEADING_EMOJI.exec(first.value)?.[0] : undefined;

  if (!emoji) {
    return;
  }

  const rest: Text = { type: 'text', value: (first as Text).value.slice(emoji.length) };

  heading.children.splice(
    0,
    1,
    {
      type: 'element',
      tagName: 'span',
      properties: { ariaHidden: 'true' },
      children: [{ type: 'text', value: emoji }],
    },
    rest,
  );
}

/**
 *
 * @param ancestors
 */
function getKeywordScope(ancestors: Array<Root | Element>): NgDocScopedKeyword | undefined {
  const keywordScope = ancestors.find(
    (ancestor) => isElement(ancestor) && ancestor.tagName === 'ng-doc-keyword-scope',
  ) as Element | undefined;
  const key = keywordScope?.properties?.['id'];

  return key
    ? {
        key: String(key),
        title: String(keywordScope?.properties?.['title']),
      }
    : undefined;
}
