import path from 'node:path';
import type { HtmlTagDescriptor, ViteDevServer } from 'vite';

/** Timings of the development style gate, in milliseconds. */
export interface NgDocDevStyleGateTimings {
  /** How long one style sheet may hide content before the gate stops waiting for it. */
  readonly sheet: number;
  /** How long the page must add no component style sheet before the initial load is over. */
  readonly quiet: number;
  /** How long after the script starts the initial load is over, whatever happens. */
  readonly limit: number;
}

const GATE_TIMINGS: NgDocDevStyleGateTimings = { sheet: 5000, quiet: 1500, limit: 10000 };

/**
 * Returns the inline script that keeps the first paint of a development page from showing
 * components without their styles.
 *
 * With live reload, Analog compiles component styles to external style sheets: Angular adds a
 * `<link rel="stylesheet">` for a component when it first creates it, in the same task as the
 * component's elements. A link added by a script does not block rendering, so the component
 * paints unstyled until its sheet arrives. Production inlines the styles, and server rendering
 * puts them in the page, so neither has the problem.
 *
 * Only the initial load is gated: from the start of the page until it has added no component
 * sheet for `quiet` ms with none pending, until the reader's first input, or until `limit` ms,
 * whichever comes first. During it, the gate hides the body until every component sheet the page
 * adds has loaded (or failed, or waited `sheet` ms), so the first paint is styled, the way the
 * render-blocking styles of a production page are. Angular names a component in its sheet's URL
 * (`?ngcomp`); other sheets are ignored. After the initial load the gate hides nothing: a
 * component created later (a dialog, the search palette) may paint unstyled for a moment in
 * development, but the page never blanks and focus is never moved off a hidden element.
 *
 * It is a string, not a function's source, so no build or coverage tool can rewrite it with
 * helpers the page does not have. The mutation observer runs before the next paint, because
 * Angular adds the link and the elements in one task.
 * @param timings - The timings, in milliseconds.
 * @returns The script.
 */
export function ngDocDevStyleGate(timings: NgDocDevStyleGateTimings = GATE_TIMINGS): string {
  return `(() => {
  const doc = document;
  const gate = doc.createElement('style');
  const pending = new Set();
  let initial = true;
  let quiet;
  gate.setAttribute('data-ng-doc-style-gate', '');
  doc.head.appendChild(gate);
  const render = () => {
    gate.textContent = initial && pending.size ? 'body{visibility:hidden!important}' : '';
  };
  const end = () => {
    if (!initial) return;
    initial = false;
    clearTimeout(quiet);
    observer.disconnect();
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) removeEventListener(type, end, true);
    pending.clear();
    render();
  };
  const settle = (link) => {
    if (!pending.delete(link)) return;
    render();
    if (!pending.size) { clearTimeout(quiet); quiet = setTimeout(end, ${timings.quiet}); }
  };
  const component = (link) => {
    try { return new URL(link.getAttribute('href') || '', doc.baseURI).searchParams.has('ngcomp'); } catch { return false; }
  };
  const watch = (link) => {
    if (pending.has(link) || link.rel !== 'stylesheet' || link.sheet || !component(link)) return;
    clearTimeout(quiet);
    pending.add(link);
    link.addEventListener('load', () => settle(link), { once: true });
    link.addEventListener('error', () => settle(link), { once: true });
    setTimeout(() => settle(link), ${timings.sheet});
    render();
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => { if (node instanceof HTMLLinkElement) watch(node); });
      record.removedNodes.forEach((node) => { if (node instanceof HTMLLinkElement) settle(node); });
    }
  });
  observer.observe(doc.head, { childList: true });
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(type, end, { capture: true, passive: true });
  setTimeout(end, ${timings.limit});
})();`;
}

/** The development style gate with its default timings. */
export const NG_DOC_DEV_STYLE_GATE = ngDocDevStyleGate();

/**
 * The index page tags that let the first paint of a development page look like production:
 * the global style sheets inlined in `<head>`, and the component style gate.
 *
 * Vite adds a global style sheet with a script, after the application's modules have loaded, so
 * the first paint has no global styles: no font, layout or theme background (a dark theme paints
 * white first). Each inlined sheet is a `<style data-vite-dev-id>` with the id Vite's client
 * uses for it: the client adopts the element, so the module's own copy replaces its text in
 * place, and hot updates keep working, with no duplicate and no change of order. A sheet that
 * fails to compile is left to the module, which reports the error.
 * @param server - The development server.
 * @param styles - The global style sheets, as absolute paths.
 * @returns The tags to add to `<head>`.
 */
export async function ngDocDevStyleTags(
  server: ViteDevServer,
  styles: readonly string[],
): Promise<HtmlTagDescriptor[]> {
  const environment = server.environments.client;
  const root = server.config.root;
  const tags: HtmlTagDescriptor[] = [
    { tag: 'script', children: NG_DOC_DEV_STYLE_GATE, injectTo: 'head-prepend' },
  ];

  for (const style of styles) {
    const relative = path.relative(root, style);
    const url =
      relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? `/${relative.split(path.sep).join('/')}`
        : `/@fs/${style.split(path.sep).join('/').replace(/^\/+/, '')}`;

    try {
      const sheet = cssModuleSheet((await environment.transformRequest(url))?.code ?? '');

      if (!sheet) continue;
      tags.push({
        tag: 'style',
        attrs: { type: 'text/css', 'data-vite-dev-id': sheet.id },
        // A closing tag in the CSS would end the element early.
        children: sheet.css.replace(/<\/style/gi, '<\\/style'),
        injectTo: 'head',
      });
    } catch {
      // The module reports the error when the page imports it.
    }
  }

  return tags;
}

/**
 * Reads the id and the CSS out of a style sheet module as Vite serves it in development. The
 * page imports that same module, so transforming it here costs nothing extra; a `?direct`
 * request would add a second module that every edit of the sheet then hot-updates, which makes
 * the client reload the page.
 * @param code - The module's code.
 * @returns The sheet, or `undefined` for code in another shape.
 */
export function cssModuleSheet(code: string): { id: string; css: string } | undefined {
  const literal = (name: string): string | undefined => {
    const match = new RegExp(`const ${name} = ("(?:[^"\\\\]|\\\\.)*")`).exec(code);
    if (!match) return undefined;
    try {
      // The pattern matched a whole string literal, so JSON yields a string.
      return JSON.parse(match[1]) as string;
    } catch {
      return undefined;
    }
  };
  const id = literal('__vite__id');
  const css = literal('__vite__css');

  return id && css !== undefined ? { id, css } : undefined;
}
