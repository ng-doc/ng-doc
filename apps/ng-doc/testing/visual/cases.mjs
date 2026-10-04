/**
 * The visual matrix: which implemented page is compared with which Hybrid reference screenshot.
 *
 * References are the Hybrid prototype screenshots, read from the directory NGDOC_VISUAL_FIXTURES
 * names (see playwright.config.mjs); they are not part of the repository. Page references are
 * `audit-final/<ref>-<width>-<theme>.png` (full-page captures at 375 and 1440, one 900px viewport
 * at 768 and 1280). Close-ups are `<ref>-<theme>.png`, compared with one element of the page
 * captured at 1440.
 */

/** Widths of the page matrix. */
export const WIDTHS = [375, 768, 1280, 1440];

/** Themes of the matrix: `light` removes `data-theme`, `dark` sets `data-theme="dark"`. */
export const THEMES = ['light', 'dark'];

/** Viewport height of every capture; the "fold" metric compares this many rows. */
export const VIEWPORT_HEIGHT = 900;

/**
 * Pages of the docs site and the prototype each one is compared with.
 * @type {Array<{id: string, route: string, reference: string, ready: string}>}
 */
export const PAGES = [
  {
    id: 'guide',
    route: '/docs/demos-and-playgrounds/playgrounds',
    reference: 'guide',
    ready: 'ng-doc-page-wrapper article h1',
  },
  {
    id: 'api-class',
    route: '/docs/api/classes/app/NgDocBasePlayground',
    reference: 'api-class',
    ready: 'ng-doc-page-wrapper article h1',
  },
  {
    id: 'api-list',
    route: '/docs/api',
    reference: 'api-list',
    ready: 'ng-doc-api-list',
  },
  {
    id: 'landing',
    route: '/',
    reference: 'landing',
    ready: 'body',
  },
];

/**
 * Component close-ups, captured from a page at 1440 and cropped to the reference size from the
 * element's top-left corner.
 * @type {Array<{id: string, route: string, reference: string, selector: string}>}
 */
export const CLOSE_UPS = [
  {
    id: 'sidebar',
    route: '/docs/demos-and-playgrounds/playgrounds',
    reference: 'sidebar',
    selector: 'ng-doc-sidebar',
  },
  {
    id: 'toc',
    route: '/docs/demos-and-playgrounds/playgrounds',
    reference: 'toc',
    selector: 'ng-doc-toc',
  },
  {
    id: 'playground',
    route: '/docs/demos-and-playgrounds/playgrounds',
    reference: 'playground',
    selector: 'ng-doc-playground',
  },
];

/**
 * Every case of the matrix.
 * @returns {Array<{name: string, kind: 'page' | 'close-up', route: string, ready: string,
 *   selector?: string, width: number, theme: string, reference: string}>}
 */
export function cases() {
  const pages = PAGES.flatMap((page) =>
    WIDTHS.flatMap((width) =>
      THEMES.map((theme) => ({
        name: `${page.id}-${width}-${theme}`,
        kind: 'page',
        route: page.route,
        ready: page.ready,
        width,
        theme,
        reference: `audit-final/${page.reference}-${width}-${theme}.png`,
      })),
    ),
  );
  const closeUps = CLOSE_UPS.flatMap((closeUp) =>
    THEMES.map((theme) => ({
      name: `${closeUp.id}-1440-${theme}`,
      kind: 'close-up',
      route: closeUp.route,
      ready: closeUp.selector,
      selector: closeUp.selector,
      width: 1440,
      theme,
      reference: `${closeUp.reference}-${theme}.png`,
    })),
  );

  return [...pages, ...closeUps];
}
