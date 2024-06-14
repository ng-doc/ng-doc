import { NgDocHeading, NgDocPageAnchor, NgDocScopedKeyword } from '@ng-doc/core';
import GithubSlugger from 'github-slugger';
import { Element, Root } from 'hast';
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
      const dataToSlug: string | undefined = isHeading ? toString(node) : attrSlug;

      if (dataToSlug) {
        if (node.properties) {
          const id: string =
            attrSlug && attrSlugType === 'member' ? attrSlug : slugger.slug(dataToSlug);

          node.properties['id'] = id;

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
