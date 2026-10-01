import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type NgDocDevStyleGateTimings,
  cssModuleSheet,
  NG_DOC_DEV_STYLE_GATE,
  ngDocDevStyleGate,
} from '../dev-styles';

const pages: JSDOM[] = [];

afterEach(() => pages.splice(0).forEach((page) => page.window.close()));

const HIDDEN = 'body{visibility:hidden!important}';

/**
 * A page with the gate installed, with short timings. jsdom loads no style sheets, so a test
 * settles each link by dispatching its `load` or `error` event, and marks a loaded one by giving
 * it a `sheet`.
 * @param timings - The gate's timings.
 * @returns The page's window and helpers.
 */
function page(timings: NgDocDevStyleGateTimings = { sheet: 200, quiet: 60, limit: 2000 }): {
  window: JSDOM['window'];
  gate: () => string;
  link: (href: string, loaded?: boolean) => HTMLLinkElement;
  flush: (ms?: number) => Promise<void>;
} {
  const dom = new JSDOM('<!doctype html><html><head><base href="/"></head><body></body></html>', {
    url: 'http://localhost:4200/docs/page',
    runScripts: 'outside-only',
  });

  pages.push(dom);
  dom.window.eval(ngDocDevStyleGate(timings));

  const document = dom.window.document;

  return {
    window: dom.window,
    gate: () => document.querySelector('style[data-ng-doc-style-gate]')?.textContent ?? '',
    link: (href: string, loaded: boolean = false) => {
      const link = document.createElement('link');

      link.rel = 'stylesheet';
      link.setAttribute('href', href);
      if (loaded) Object.defineProperty(link, 'sheet', { value: {} });
      document.head.appendChild(link);

      return link;
    },
    // Mutation observers report in a microtask; timers need real time.
    flush: (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

describe('development style gate', () => {
  it('uses the default timings in the shipped script', () => {
    expect(NG_DOC_DEV_STYLE_GATE).toBe(
      ngDocDevStyleGate({ sheet: 5000, quiet: 1500, limit: 10000 }),
    );
  });

  it('hides the page during the initial load until every component sheet has loaded', async () => {
    const { gate, link, flush, window } = page();
    const first = link('a1b2.scss?ngcomp=ng-c123&e=0');
    const second = link('c3d4.scss?ngcomp&e=2');

    await flush();
    expect(gate()).toBe(HIDDEN);
    first.dispatchEvent(new window.Event('load'));
    expect(gate()).toBe(HIDDEN);
    second.dispatchEvent(new window.Event('error'));
    expect(gate()).toBe('');
  });

  it('ignores other style sheets and sheets that have already loaded', async () => {
    const { gate, link, flush } = page();

    link('/styles.css');
    link('a1b2.scss?ngcomp=ng-c123&e=0', true);
    link('http://[invalid');
    await flush();
    expect(gate()).toBe('');
  });

  it('stops waiting for a sheet that neither loads nor fails, and for a removed one', async () => {
    const { gate, link, flush } = page();

    link('stuck.scss?ngcomp=ng-c1&e=0');
    await flush();
    expect(gate()).toBe(HIDDEN);
    await flush(250);
    expect(gate()).toBe('');

    const { gate: gate2, link: link2, flush: flush2 } = page();
    const removed = link2('removed.scss?ngcomp=ng-c2&e=0');

    await flush2();
    expect(gate2()).toBe(HIDDEN);
    removed.remove();
    await flush2();
    expect(gate2()).toBe('');
  });

  it('keeps gating a lazy route whose sheets follow within the quiet time', async () => {
    const { gate, link, flush, window } = page();

    const root = link('root.scss?ngcomp=ng-c1&e=0');

    await flush();
    root.dispatchEvent(new window.Event('load'));
    await flush(20);
    // A lazy route rendered shortly after the root: still the initial load.
    link('route.scss?ngcomp&e=2');
    await flush();
    expect(gate()).toBe(HIDDEN);
  });

  it('never hides the page for components created after the initial load', async () => {
    const { gate, link, flush, window } = page();

    const root = link('root.scss?ngcomp=ng-c1&e=0');

    await flush();
    root.dispatchEvent(new window.Event('load'));
    await flush(100);
    // The search palette opens later: its sheet hides nothing, the page and focus stay.
    link('palette.scss?ngcomp&e=2');
    link('dialog.scss?ngcomp=ng-c9&e=0');
    await flush();
    expect(gate()).toBe('');
  });

  it('ends the initial load at the first input, unhiding a pending sheet', async () => {
    const { gate, link, flush, window } = page();

    link('slow.scss?ngcomp=ng-c1&e=0');
    await flush();
    expect(gate()).toBe(HIDDEN);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(gate()).toBe('');
    link('palette.scss?ngcomp&e=2');
    await flush();
    expect(gate()).toBe('');
  });

  it('ends the initial load after its time limit', async () => {
    const { gate, link, flush } = page({ sheet: 5000, quiet: 5000, limit: 80 });

    link('slow.scss?ngcomp=ng-c1&e=0');
    await flush();
    expect(gate()).toBe(HIDDEN);
    await flush(120);
    expect(gate()).toBe('');
    link('later.scss?ngcomp&e=2');
    await flush();
    expect(gate()).toBe('');
  });
});

describe('cssModuleSheet', () => {
  it('reads the id and the CSS of a development style module', () => {
    const code = [
      'import { updateStyle as __vite__updateStyle } from "/@vite/client"',
      'const __vite__id = "/workspace/src/styles.scss"',
      'const __vite__css = "body {\\n  content: \\"a\\\\\\"b\\";\\n}"',
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n');

    expect(cssModuleSheet(code)).toEqual({
      id: '/workspace/src/styles.scss',
      css: 'body {\n  content: "a\\"b";\n}',
    });
  });

  it('returns nothing for code in another shape', () => {
    expect(cssModuleSheet('export default "body {}"')).toBeUndefined();
    expect(cssModuleSheet('const __vite__id = "/a.css"')).toBeUndefined();
    expect(cssModuleSheet('const __vite__id = "" const __vite__css = ""')).toBeUndefined();
    expect(cssModuleSheet('const __vite__id = "\\x" const __vite__css = ""')).toBeUndefined();
  });
});
