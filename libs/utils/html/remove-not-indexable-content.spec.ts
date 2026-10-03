import { describe, expect, it } from 'vitest';

import { removeNotIndexableContent } from './remove-not-indexable-content';

/**
 * The body of the document that `removeNotIndexableContent` returns.
 * @param html
 */
async function indexable(html: string): Promise<string> {
  return (await removeNotIndexableContent(html)).replace(/^.*<body>|<\/body>.*$/g, '');
}

describe('removeNotIndexableContent', () => {
  it('leaves out the hidden leading emoji of a heading, and keeps every other span', async () => {
    expect(
      await indexable(
        '<h2 id="use-it"><span aria-hidden="true">🧰</span> Use it</h2>' +
          '<h3 id="tail">Tail <span aria-hidden="true">🧰</span></h3>' +
          '<p><span aria-hidden="true">kept</span></p>',
      ),
    ).toBe(
      '<h2 id="use-it"> Use it</h2>' +
        '<h3 id="tail">Tail <span aria-hidden="true">🧰</span></h3>' +
        '<p><span aria-hidden="true">kept</span></p>',
    );
  });

  it('removes code blocks and the content marked as not indexable', async () => {
    expect(
      await indexable(
        '<p>Text</p><pre><code>code()</code></pre><div indexable="false"><p>Hidden</p></div>',
      ),
    ).toBe('<p>Text</p>');
  });
});
