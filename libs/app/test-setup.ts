// Vitest's jsdom environment keeps Node's AbortController, whose signals jsdom's EventTarget
// rejects: zone.js adds the abort listener of an `addEventListener(..., { signal })` call with
// jsdom's addEventListener. A browser, like jsdom, has one AbortController, so the specs use jsdom's.
// Specs that run in the Node environment (`@vitest-environment node`) have no jsdom.
//
// The same holds for Web Storage: from Node 25, Node defines `localStorage` and `sessionStorage`
// itself, and without `--localstorage-file` its `localStorage` is undefined. The environment keeps
// Node's, so the specs use jsdom's, as a browser has.
const dom = (
  globalThis as {
    jsdom?: {
      window: {
        AbortController: typeof AbortController;
        AbortSignal: typeof AbortSignal;
        localStorage: Storage;
        sessionStorage: Storage;
      };
    };
  }
).jsdom;

if (dom) {
  Object.defineProperties(globalThis, {
    AbortController: { configurable: true, writable: true, value: dom.window.AbortController },
    AbortSignal: { configurable: true, writable: true, value: dom.window.AbortSignal },
    localStorage: { configurable: true, writable: true, value: dom.window.localStorage },
    sessionStorage: { configurable: true, writable: true, value: dom.window.sessionStorage },
  });
}
