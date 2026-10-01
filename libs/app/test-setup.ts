// Vitest's jsdom environment keeps Node's AbortController, whose signals jsdom's EventTarget
// rejects: zone.js adds the abort listener of an `addEventListener(..., { signal })` call with
// jsdom's addEventListener. A browser, like jsdom, has one AbortController, so the specs use jsdom's.
// Specs that run in the Node environment (`@vitest-environment node`) have no jsdom.
const dom = (
  globalThis as {
    jsdom?: {
      window: { AbortController: typeof AbortController; AbortSignal: typeof AbortSignal };
    };
  }
).jsdom;

if (dom) {
  Object.defineProperties(globalThis, {
    AbortController: { configurable: true, writable: true, value: dom.window.AbortController },
    AbortSignal: { configurable: true, writable: true, value: dom.window.AbortSignal },
  });
}
