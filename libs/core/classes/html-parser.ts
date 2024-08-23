import * as CSSWhat from 'css-what';
import { AttributeSelector, SelectorType } from 'css-what';
import { Selector, TagSelector } from 'css-what/lib/es/types';
import { Node, NodeTag, parser } from 'posthtml-parser';
import { render } from 'posthtml-render';

import { asArray, isNodeTag, isPresent, objectKeys } from '../helpers';

export class NgDocHtmlParser {
  private readonly parsedHTML: Node[];

  constructor(private html: string) {
    this.parsedHTML = parser(this.html);
  }

  find(selector: string): NodeTag | undefined {
    const selectors: Selector[] = CSSWhat.parse(selector)[0];
    const tagSelectors: TagSelector[] = selectors.filter(
      (selector: Selector) => selector.type === SelectorType.Tag,
    ) as TagSelector[];
    const attrSelectors: AttributeSelector[] = selectors.filter(
      (selector: Selector) => selector.type === SelectorType.Attribute,
    ) as AttributeSelector[];

    const nodes: Node[] = [...this.parsedHTML];

    while (nodes.length) {
      const shiftNode: Node | undefined = nodes.shift();
      const node: NodeTag | undefined =
        !isPresent(shiftNode) || !isNodeTag(shiftNode) ? undefined : shiftNode;
      const tagSelectorMatch: boolean =
        tagSelectors.every(
          (tagSelector) => tagSelector.name.toLowerCase() === String(node?.tag).toLowerCase(),
        ) || !tagSelectors.length;
      const attrSelectorsMatch: boolean =
        attrSelectors.every((attrSelector: AttributeSelector) => {
          const nodeAttrs = node?.attrs ?? {};
          const hasAttr =
            Object.keys(nodeAttrs).includes(attrSelector.name) ||
            Object.keys(nodeAttrs).includes(`[${attrSelector.name}]`);
          const attrValue: unknown =
            nodeAttrs[attrSelector.name] ?? nodeAttrs[`[${attrSelector.name}]`];

          return (hasAttr && !attrSelector.value) || attrValue === attrSelector.value;
        }) || !attrSelectors.length;

      if (tagSelectorMatch && attrSelectorsMatch) {
        return node;
      } else {
        nodes.push(...asArray(node?.content).flat());
      }
    }

    return undefined;
  }

  removeAttribute(node: Node, name: string): void {
    if (isNodeTag(node) && Object.keys(node?.attrs ?? {}).includes(name) && node.attrs) {
      delete node.attrs[name];
    }
    if (isNodeTag(node) && Object.keys(node?.attrs ?? {}).includes(`[${name}]`) && node.attrs) {
      delete node.attrs[`[${name}]`];
    }
  }

  setAttribute(node: Node, name: string, value?: string): void {
    if (isNodeTag(node)) {
      if (!node.attrs) {
        node.attrs = {};
      }

      node.attrs[name] = value ?? '';
    }
  }

  setAttributesFromSelectors(element: NodeTag, selectors: Selector[]): void {
    const elementAttrs = element.attrs ?? {};

    selectors.forEach((selector: Selector) => {
      if (
        selector.type === 'attribute' &&
        !elementAttrs[selector.name] &&
        !elementAttrs[`[${selector.name}]`]
      ) {
        this.setAttribute(element, selector.name, selector.value);
      }
    });
  }

  fillAngularAttributes(element: NodeTag, properties: Record<string, string>): void {
    objectKeys(properties).forEach((key: string) => {
      this.removeAttribute(element, String(key));
      this.setAttribute(element, `[${String(key)}]`, properties[key]);
    });
  }

  serialize(): string {
    return render(this.parsedHTML);
  }
}
