import { toString } from 'hast-util-to-string';
import { Handler } from 'mdast-util-to-hast/lib/state';

export const blockquote: Handler = (state, node) => {
  const [titleNode, ...rest] = node.children[0]?.children ?? [];
  const hasTitle = titleNode?.type === 'strong';

  const res = {
    type: 'element',
    tagName: 'blockquote',
    properties: {
      'ng-doc-blockquote': '',
      type: hasTitle ? toString(titleNode).toLowerCase() : 'default',
    },
    children: state.wrap(hasTitle ? rest : [titleNode, ...rest]),
  };

  return res as any;
};
