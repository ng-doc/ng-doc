import {
  type DocNode,
  DocErrorText,
  DocExcerpt,
  DocPlainText,
  TSDocParser,
} from '@microsoft/tsdoc';
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
      for (const childNode of Formatter.filterOutStatusTag(docNode.getChildNodes())) {
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

  private static filterOutStatusTag(docNodes: readonly DocNode[]): readonly DocNode[] {
    if (docNodes.length < 2) return docNodes;

    const result: DocNode[] = [];

    for (let i = 0; i < docNodes.length; i += 2) {
      const node1 = docNodes.at(i),
        node2 = docNodes.at(i + 1);

      if (
        node1 instanceof DocErrorText &&
        node1.text === '@' &&
        node2 instanceof DocPlainText &&
        node2.text.startsWith('status:')
      ) {
        continue;
      }

      if (node1) result.push(node1);
      if (node2) result.push(node2);
    }

    return result;
  }
}

/**
 *
 * @param node
 */
export function getJsDocDescription(node: JSDocableNode): string {
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
  const tsdocParser = new TSDocParser();
  const parserContext = tsdocParser.parseString(jsDocs[0]?.getText() ?? '');

  const param = Formatter.renderDocNodes(
    parserContext.docComment.params.tryGetBlockByName(paramName)?.content?.getChildNodes() ?? [],
  );

  return markdownToHtml(param).trim();
}
