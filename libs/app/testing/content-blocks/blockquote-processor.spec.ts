import { blockquoteProcessor } from '@ng-doc/app/processors/processors';
import { describe, expect, it } from 'vitest';

describe('blockquoteProcessor', () => {
  const element = (html: string): Element => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as Element;
  };

  it('passes the type, icon and label attributes of generated callouts', () => {
    const options = blockquoteProcessor.extractOptions(
      element(
        '<ng-doc-blockquote type="warning" icon="activity" label="Deprecated">Use X</ng-doc-blockquote>',
      ),
      document.createElement('div'),
    );

    expect(options.inputs).toEqual({ type: 'warning', icon: 'activity', label: 'Deprecated' });
    expect(options.content?.[0].map((node: Node) => node.textContent)).toEqual(['Use X']);
  });

  it('defaults to a callout without an icon or a label', () => {
    expect(
      blockquoteProcessor.extractOptions(
        element('<ng-doc-blockquote>Text</ng-doc-blockquote>'),
        document.createElement('div'),
      ).inputs,
    ).toEqual({ type: 'default', icon: undefined, label: undefined });
  });
});
