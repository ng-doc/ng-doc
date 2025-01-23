import { TSDocParser } from '@microsoft/tsdoc';
import { type DocNode, DocExcerpt } from '@microsoft/tsdoc';
import { asArray, isPresent } from '@ng-doc/core';
import { JSDocableNode } from 'ts-morph';

import { markdownToHtml } from './markdown-to-html';

export class Formatter {
  static renderDocNode(docNode: DocNode): string {
    let result: string = '';
    if (docNode) {
      if (docNode instanceof DocExcerpt) {
        result += docNode.content.toString();
      }
      for (const childNode of docNode.getChildNodes()) {
        result += Formatter.renderDocNode(childNode);
      }
    }
    return result;
  }

  static renderDocNodes(docNodes: readonly DocNode[]): string {
    let result: string = '';
    for (const docNode of docNodes) {
      result += Formatter.renderDocNode(docNode);
    }
    return result;
  }
}

/**
 *
 * @param node
 */
export function getJsDocDescription(node: JSDocableNode | undefined): string {
  if(!node) return '';
  const jsDocs = asArray(node.getJsDocs()[0]);
  const tsdocParser = new TSDocParser();
  const parserContext = tsdocParser.parseString(jsDocs[0]?.getText() ?? '');

  return markdownToHtml(
    Formatter.renderDocNodes(parserContext.docComment.summarySection.getChildNodes()),
  ).trim();
}

/**
 *
 * @param node
 * @param tagName
 */
export function getJsDocTag(node: JSDocableNode | undefined, tagName: string): string {
  if(!node) return '';
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
export function getJsDocTags(node: JSDocableNode | undefined, tagName: string): string[] {
  if(!node) return [];
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
export function getAllJsDocTags(node: JSDocableNode | undefined): Record<string, string[]> {
  if(!node) return {};
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
export function hasJsDocTag(node: JSDocableNode | undefined, tagName: string): boolean {
  if(!node) return false;
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
export function getJsDocParam(node: JSDocableNode | undefined, paramName: string): string {
  if(!node) return '';
  const jsDocs = asArray(node.getJsDocs()[0]);
  const tsdocParser = new TSDocParser();
  const parserContext = tsdocParser.parseString(jsDocs[0]?.getText() ?? '');

  const param = Formatter.renderDocNodes(
    parserContext.docComment.params.tryGetBlockByName(paramName)?.getChildNodes() ?? [],
  );

  return markdownToHtml(param).trim();
}
