import { asArray, isPresent } from '@ng-doc/core';
import { JSDocableNode } from 'ts-morph';

import { markdownToHtml } from './markdown-to-html';

/**
 *
 * @param node
 */
export function getJsDocDescription(node: JSDocableNode): string {
  const jsDocs = asArray(node.getJsDocs()[0]);
  const description = jsDocs
    .map((doc) => doc.getStructure())
    .map(({ description }) => description)
    .join('');

  return markdownToHtml(description).trim();
}

/**
 *
 * @param node
 * @param tagName
 */
export function getJsDocTag(node: JSDocableNode, tagName: string): string {
  const jsDocs = asArray(node.getJsDocs()[0]);
  const tag = jsDocs
    .map((doc) => doc.getStructure())
    .map((doc) => doc.tags?.find((tag) => tag.tagName === tagName))
    .filter(Boolean)
    .map((tag) => tag?.text)
    .join('');

  return markdownToHtml(tag).trim();
}

/**
 *
 * @param node
 * @param tagName
 */
export function getJsDocTags(node: JSDocableNode, tagName: string): string[] {
  const jsDocs = asArray(node.getJsDocs()[0]);
  const tags = jsDocs
    .map((doc) => doc.getStructure())
    .map((doc) => doc.tags?.filter((tag) => tag.tagName === tagName))
    .flat()
    .filter(isPresent)
    .map((tag) => tag?.text);

  return tags.map((tag) => markdownToHtml(String(tag)).trim());
}

/**
 *
 * @param node
 */
export function getAllJsDocTags(node: JSDocableNode): Record<string, string[]> {
  const jsDocs = asArray(node.getJsDocs()[0]);
  const tags = jsDocs
    .map((doc) => doc.getStructure())
    .map((doc) => doc.tags)
    .flat()
    .filter(isPresent)
    .reduce(
      (acc, tag) => {
        if (!acc[tag.tagName]) {
          acc[tag.tagName] = [];
        }

        acc[tag.tagName].push(String(tag.text));

        return acc;
      },
      {} as Record<string, string[]>,
    );

  return tags;
}

/**
 *
 * @param node
 * @param tagName
 */
export function hasJsDocTag(node: JSDocableNode, tagName: string): boolean {
  const jsDocs = asArray(node.getJsDocs()[0]);

  return jsDocs
    .map((doc) => doc.getStructure())
    .map((doc) => doc.tags?.some((tag) => tag.tagName === tagName))
    .filter(isPresent)
    .some(Boolean);
}

/**
 *
 * @param node
 * @param paramName
 */
export function getJsDocParam(node: JSDocableNode, paramName: string): string {
  const jsDocs = asArray(node.getJsDocs()[0]);
  const param = jsDocs
    .map((doc) => doc.getStructure())
    .map((doc) =>
      doc.tags?.find(
        (tag) => tag.tagName === 'param' && getParameter(String(tag.text)).name === paramName,
      ),
    )
    .filter(isPresent)
    .map((tag) => getParameter(String(tag.text)).description)
    .join('');

  return markdownToHtml(param).trim();
}

/**
 * Returns the name and description of a parameter
 * @example
 * // input: "param1 - Test param1"
 * // output: ['param1', 'Test param1']
 *
 * // input: "param1 Test param1"
 * // output: ['param1', 'Test param1']
 * @param docs
 */
function getParameter(docs: string): { name: string; description: string } {
  const match = docs.match(/(?<name>\w*)((\s?-\s?)|(\s))(?<description>.*)/);

  if (!match || !match.groups) {
    return { name: '', description: '' };
  }

  return {
    name: match.groups['name'].trim() ?? '',
    description: match.groups['description'].trim() ?? '',
  };
}
