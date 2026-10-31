import { InjectionToken } from '@angular/core';
import type { NgDocTexts, NgDocTextsOverrides } from '@ng-doc/app/interfaces';
import { NG_DOC_UI_KIT_DEFAULT_TEXTS } from '@ng-doc/ui-kit/texts';

/**
 * The English texts of the NgDoc application. They are the texts NgDoc showed before the texts
 * could be changed, so an application that changes none renders as before.
 */
export const NG_DOC_DEFAULT_TEXTS: NgDocTexts = Object.freeze({
  ...NG_DOC_UI_KIT_DEFAULT_TEXTS,
  search: Object.freeze({
    placeholder: 'Search docs…',
    label: ({ shortcut }: { shortcut: string }) => `Search (${shortcut})`,
    shortcutMac: '⌘K',
    shortcutOther: 'Ctrl K',
    resultGuides: 'Guides',
    resultApi: 'API',
    resultUnknown: 'Unknown',
    nothingFound: 'Nothing was found...',
  }),
  searchPalette: Object.freeze({
    dialogLabel: 'Search',
    inputLabel: 'Search the documentation',
    inputPlaceholder: 'Search guides, API and actions…',
    scopesLabel: 'Search scope',
    scopeAll: 'All',
    scopeGuides: 'Guides',
    scopeApi: 'API',
    scopeActions: 'Actions',
    resultsLabel: 'Results',
    sectionTopMatches: 'Top matches',
    sectionGuides: 'Guides',
    sectionApi: 'API',
    sectionActions: 'Actions',
    searching: 'Searching…',
    failed: 'Search failed. Try again.',
    failedStatus: 'Search failed.',
    noResults: ({ query }: { query: string }) => `No results for “${query}”`,
    typeToSearch: 'Type to search.',
    typeToSearchGuides: 'Type to search the guides.',
    typeToSearchApi: 'Type to search the API.',
    typeApi: 'API',
    typeGuide: 'Guide',
    typeAction: 'Action',
    actionKeepsOpen: 'Changes the setting and keeps the search open.',
    actionRunsImmediately: 'Runs immediately.',
    shortcut: 'Shortcut',
    openSymbolPage: 'open symbol page',
    open: 'open',
    statusScope: ({ scope }: { scope: string }) => `${scope} scope.`,
    statusResults: ({ scope, count }: { scope: string; count: number }) =>
      `${scope} scope: ${count} ${count === 1 ? 'result' : 'results'}.`,
    statusNoResults: ({ scope, query }: { scope: string; query: string }) =>
      `${scope} scope: no results for “${query}”.`,
    keyEscape: 'Esc',
    keyTab: 'Tab',
    footerNavigate: 'navigate',
    footerScopes: 'scopes and settings',
    footerSlash: 'also opens search',
    shortcutsSwitch: 'Single-key shortcuts',
    shortcutsSwitchTitle: 'Single-character shortcuts: / [ ] F L T',
    actionToggleTheme: 'Toggle dark mode',
    actionToggleThemeKeywords: 'theme dark light mode',
    actionCopyLink: 'Copy link to this page',
    actionCopyLinkKeywords: 'copy link url share',
    actionShortcutsOn: 'Turn on single-key shortcuts',
    actionShortcutsOff: 'Turn off single-key shortcuts',
    actionShortcutsKeywords: 'keyboard shortcuts keys single',
  }),
  copy: Object.freeze({
    copy: 'Copy to clipboard',
    copied: 'Copied!',
    copyCode: 'Copy code',
    copyLinkToSection: 'Copy link to section',
  }),
  demo: Object.freeze({
    viewsLabel: 'Demo view',
    preview: 'Preview',
    widthsLabel: 'Preview width',
    widthFull: 'Full width',
    width480: '480 pixels wide',
    width280: '280 pixels wide',
    readoutFull: '100% × auto',
    readout480: '480 × auto',
    readout280: '280 × auto',
    openInNewTab: 'Open in a new tab',
    frameTitle: ({ name }: { name: string }) => `${name} demo`,
    showCode: 'Show code',
    hideCode: 'Hide code',
    code: 'Code',
    loading: 'Loading the demo.',
    failed: 'The demo did not load.',
    openFrameInNewTab: 'Open it in a new tab',
    openFullscreenRoute: 'Open demo in a new tab',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    themePage: 'Page theme',
    themeLabel: ({ current, next }: { current: string; next: string }) =>
      `Demo theme: ${current}. Switch to ${next}`,
    themeTooltip: ({ current }: { current: string }) => `Demo theme: ${current}`,
  }),
  playground: Object.freeze({
    title: 'Playground',
    reset: 'Reset',
    recreate: 'Recreate',
    recreateHint: 'Recreates the demo every time one of the inputs changes',
    content: 'Content',
    settings: 'Settings',
    defaultValue: 'default',
    resetToDefault: 'Reset to the default value',
    addItem: 'Add item',
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeItem: 'Remove',
    item: ({ index }: { index: number }) => `Item ${index}`,
    invalidJson: 'Invalid JSON',
    frameTitle: ({ id, target }: { id: string; target: string }) => `${id} playground: ${target}`,
    inPageControl: ({ input }: { input: string }) =>
      `This playground runs in the page because the control of \`${input}\` doesn't support it.`,
    inPageValue: ({ input, reason }: { input: string; reason: string }) =>
      `This playground runs in the page because the value of \`${input}\` (${reason}) can't be sent to its frame.`,
    inPageDefault: ({ input }: { input: string }) =>
      `This playground runs in the page because the default value of \`${input}\` can't be sent to its frame.`,
    inPageTooLong:
      'This playground runs in the page because its values are too long for the URL of its frame.',
    inPageSelector: ({ selector }: { selector: string }) =>
      `This playground runs in the page because \`${selector}\` is not a selector of its target.`,
    inPageFrameError: ({ message }: { message: string }) =>
      `This playground runs in the page because its frame failed: ${message}`,
    inPageFrameSilent: 'This playground runs in the page because its frame did not load.',
    missing: 'This playground does not exist.',
  }),
  navigation: Object.freeze({
    skipToContent: 'Skip to content',
    openMenu: 'Open navigation',
    closeMenu: 'Close navigation',
    sidebar: 'Documentation',
    breadcrumbs: 'Breadcrumb',
    pages: 'Previous and next page',
    previous: 'Previous',
    next: 'Next',
  }),
  page: Object.freeze({
    copyLink: 'Copy link to this page',
    linkCopied: 'Link copied',
    copyLinkTooltip: 'Copy link',
    linkCopiedTooltip: 'Copied',
    edit: 'Edit this page',
    viewSource: 'View the page source',
    viewSourceTooltip: 'View source',
    backTo: ({ title }: { title?: string }) => `Back to ${title ?? 'the page'}`,
    back: 'Back',
  }),
  content: Object.freeze({
    openImage: ({ alt }: { alt: string }) => `Open image: ${alt}`,
    codeLines: ({ count, ranges }: { count: number; ranges: string }) =>
      `${count === 1 ? 'Line' : 'Lines'} ${ranges}`,
  }),
  toc: Object.freeze({
    symbol: 'Symbol',
    onThisPage: 'On this page',
    readingProgress: 'Reading progress',
    backToTop: 'Back to top',
    copyLink: 'Copy link',
    copied: 'Copied',
    edit: 'Edit this page',
  }),
  theme: Object.freeze({
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
    label: ({ current, next }: { current: string; next: string }) =>
      `${current} theme. Switch to ${next.toLowerCase()}`,
    tooltip: ({ current }: { current: string }) => `${current} theme`,
  }),
  apiList: Object.freeze({
    title: 'API References',
    summary: ({ declarations, scopes }: { declarations: number; scopes: number }) =>
      `${declarations} declarations in ${scopes} ${scopes === 1 ? 'scope' : 'scopes'}.`,
    filterPlaceholder: 'Filter by name',
    filterPlaceholderWithDescriptions: 'Filter by name or description',
    filterLabel: 'Filter declarations by name',
    filterLabelWithDescriptions: 'Filter declarations by name or description',
    groupBy: 'Group by',
    groupByKind: 'Kind',
    groupByScope: 'Scope',
    kindsLabel: 'Filter by kind',
    allKinds: 'All',
    scopeNote: ({ scope }: { scope: string }) => `Showing ${scope} only.`,
    showEveryScope: 'Show every scope',
    noDescription: 'No description',
    empty: 'No declarations match.',
    failed: 'The API list could not be loaded.',
  }),
});

/**
 * The texts the NgDoc application shows. It resolves to `NG_DOC_DEFAULT_TEXTS` unless
 * `provideNgDocTexts` changes them. Inject it to show the same texts in your own components.
 */
export const NG_DOC_TEXTS: InjectionToken<NgDocTexts> = new InjectionToken<NgDocTexts>(
  'NG_DOC_TEXTS',
  { providedIn: 'root', factory: () => NG_DOC_DEFAULT_TEXTS },
);

/**
 * Applies changes to texts: each group of each change replaces the texts it sets, in order, so a
 * later change wins. A text set to `undefined` keeps its value. The result is frozen.
 * @param texts - The texts to change.
 * @param overrides - The changes, the last one winning.
 * @returns New texts; `texts` and the changes are left as they are.
 */
export function mergeNgDocTexts(
  texts: NgDocTexts,
  ...overrides: readonly NgDocTextsOverrides[]
): NgDocTexts {
  const merged: Record<string, Record<string, unknown>> = { ...texts } as unknown as Record<
    string,
    Record<string, unknown>
  >;

  for (const override of overrides) {
    for (const [group, values] of Object.entries(override ?? {})) {
      const defined = Object.entries((values ?? {}) as Record<string, unknown>).filter(
        ([, value]: [string, unknown]) => value !== undefined,
      );

      if (defined.length) {
        merged[group] = { ...merged[group], ...Object.fromEntries(defined) };
      }
    }
  }

  for (const group of Object.keys(merged)) {
    merged[group] = Object.freeze(merged[group]);
  }

  return Object.freeze(merged) as unknown as NgDocTexts;
}
