import type { NgDocUiKitTexts } from '@ng-doc/ui-kit/interfaces';

/**
 * The texts of the search button in the navbar and of the search result list
 * (`NgDocSearchResultComponent`).
 */
export interface NgDocSearchTexts {
  /** Text of the search field in the navbar. Default: "Search docs…". */
  placeholder: string;
  /**
   * Accessible name of the search buttons. Default: "Search (⌘K)", with the shortcut of the
   * reader's platform.
   * Values: `shortcut`, the `shortcutMac` or `shortcutOther` text.
   */
  label: (params: { shortcut: string }) => string;
  /** The shortcut that opens the search on Apple platforms, and on the server. Default: "⌘K". */
  shortcutMac: string;
  /** The shortcut that opens the search on other platforms. Default: "Ctrl K". */
  shortcutOther: string;
  /** Heading of the guides in the search result list. Default: "Guides". */
  resultGuides: string;
  /** Heading of the API pages in the search result list. Default: "API". */
  resultApi: string;
  /** Heading of pages of another type in the search result list. Default: "Unknown". */
  resultUnknown: string;
  /** The search result list without results. Default: "Nothing was found...". */
  nothingFound: string;
}

/**
 * The texts of the search palette (`NgDocCommandPaletteComponent`), which the navbar search opens.
 */
export interface NgDocSearchPaletteTexts {
  /** Accessible name of the palette dialog. Default: "Search". */
  dialogLabel: string;
  /** Accessible name of the search field. Default: "Search the documentation". */
  inputLabel: string;
  /** Placeholder of the search field. Default: "Search guides, API and actions…". */
  inputPlaceholder: string;
  /** Accessible name of the scope tabs. Default: "Search scope". */
  scopesLabel: string;
  /** The scope with every result. Default: "All". */
  scopeAll: string;
  /** The scope of the guides. Default: "Guides". */
  scopeGuides: string;
  /** The scope of the API pages. Default: "API". */
  scopeApi: string;
  /** The scope of the actions. Default: "Actions". */
  scopeActions: string;
  /** Accessible name of the result list. Default: "Results". */
  resultsLabel: string;
  /** Section of the declarations whose name starts with the query. Default: "Top matches". */
  sectionTopMatches: string;
  /** Section of the guides. Default: "Guides". */
  sectionGuides: string;
  /** Section of the API pages. Default: "API". */
  sectionApi: string;
  /** Section of the actions. Default: "Actions". */
  sectionActions: string;
  /** Shown and announced while the search runs. Default: "Searching…". */
  searching: string;
  /** Shown when the search fails. Default: "Search failed. Try again.". */
  failed: string;
  /** Announced when the search fails. Default: "Search failed.". */
  failedStatus: string;
  /**
   * Shown when nothing matches the query. Default: "No results for “{query}”".
   * Values: `query`, the query.
   */
  noResults: (params: { query: string }) => string;
  /** Shown before the reader types, in the All and Actions scopes. Default: "Type to search.". */
  typeToSearch: string;
  /** Shown before the reader types, in the Guides scope. Default: "Type to search the guides.". */
  typeToSearchGuides: string;
  /** Shown before the reader types, in the API scope. Default: "Type to search the API.". */
  typeToSearchApi: string;
  /** Chip of an API result in the preview. Default: "API". */
  typeApi: string;
  /** Chip of a guide result in the preview. Default: "Guide". */
  typeGuide: string;
  /** Label of an action in the preview. Default: "Action". */
  typeAction: string;
  /**
   * Preview of an action that keeps the palette open. Default: "Changes the setting and keeps the
   * search open.".
   */
  actionKeepsOpen: string;
  /** Preview of an action that closes the palette. Default: "Runs immediately.". */
  actionRunsImmediately: string;
  /** Label of the keys of an action in the preview. Default: "Shortcut". */
  shortcut: string;
  /** Hint of the Enter key on an API result. Default: "open symbol page". */
  openSymbolPage: string;
  /** Hint of the Enter key, in the preview and the footer. Default: "open". */
  open: string;
  /**
   * Announced when the query is empty. Default: "{scope} scope.".
   * Values: `scope`, the name of the selected scope.
   */
  statusScope: (params: { scope: string }) => string;
  /**
   * Announced when the search finds results. Default: "{scope} scope: {count} result(s).".
   * Values: `scope`, the name of the selected scope; `count`, the number of results.
   */
  statusResults: (params: { scope: string; count: number }) => string;
  /**
   * Announced when the search finds nothing. Default: "{scope} scope: no results for “{query}”.".
   * Values: `scope`, the name of the selected scope; `query`, the query.
   */
  statusNoResults: (params: { scope: string; query: string }) => string;
  /** The Escape key, which closes the palette. Default: "Esc". */
  keyEscape: string;
  /** The Tab key, in the footer. Default: "Tab". */
  keyTab: string;
  /** Footer hint of the arrow keys. Default: "navigate". */
  footerNavigate: string;
  /** Footer hint of the Tab key. Default: "scopes and settings". */
  footerScopes: string;
  /** Footer hint of the slash key. Default: "also opens search". */
  footerSlash: string;
  /** The switch for single-key shortcuts. Default: "Single-key shortcuts". */
  shortcutsSwitch: string;
  /** Tooltip of the switch. Default: "Single-character shortcuts: / [ ] F L T". */
  shortcutsSwitchTitle: string;
  /** The action that switches the theme. Default: "Toggle dark mode". */
  actionToggleTheme: string;
  /**
   * Words, separated by spaces, that find the theme action. Default: "theme dark light mode".
   */
  actionToggleThemeKeywords: string;
  /** The action that copies the page link. Default: "Copy link to this page". */
  actionCopyLink: string;
  /** Words, separated by spaces, that find the copy action. Default: "copy link url share". */
  actionCopyLinkKeywords: string;
  /** The action that turns single-key shortcuts on. Default: "Turn on single-key shortcuts". */
  actionShortcutsOn: string;
  /** The action that turns single-key shortcuts off. Default: "Turn off single-key shortcuts". */
  actionShortcutsOff: string;
  /**
   * Words, separated by spaces, that find the shortcuts action. Default: "keyboard shortcuts keys
   * single".
   */
  actionShortcutsKeywords: string;
}

/**
 * The texts of the copy buttons (`NgDocCopyButtonComponent`).
 */
export interface NgDocCopyTexts {
  /**
   * Accessible name and tooltip of a copy button, unless its `label` input sets one. Default:
   * "Copy to clipboard".
   */
  copy: string;
  /** Tooltip after a copy button copied its text. Default: "Copied!". */
  copied: string;
  /** Label of the copy button of a demo's code. Default: "Copy code". */
  copyCode: string;
  /** Label of the copy button next to a heading. Default: "Copy link to section". */
  copyLinkToSection: string;
}

/**
 * The texts of the demos (`NgDocDemoComponent`, `NgDocDemoPaneComponent` and the components they
 * use).
 */
export interface NgDocDemoTexts {
  /** Accessible name of the view tabs of a demo. Default: "Demo view". */
  viewsLabel: string;
  /** The tab of the demo's preview. Default: "Preview". */
  preview: string;
  /** Accessible name of the preview width buttons. Default: "Preview width". */
  widthsLabel: string;
  /** The full width button. Default: "Full width". */
  widthFull: string;
  /** The 480 pixels button. Default: "480 pixels wide". */
  width480: string;
  /** The 280 pixels button. Default: "280 pixels wide". */
  width280: string;
  /** Readout of the full width. Default: "100% × auto". */
  readoutFull: string;
  /** Readout of the 480 pixels width. Default: "480 × auto". */
  readout480: string;
  /** Readout of the 280 pixels width. Default: "280 × auto". */
  readout280: string;
  /** The button that opens the demo's page in a new tab. Default: "Open in a new tab". */
  openInNewTab: string;
  /**
   * Accessible title of the iframe of an isolated demo. Default: "{name} demo".
   * Values: `name`, the name of the demo component.
   */
  frameTitle: (params: { name: string }) => string;
  /** The button that shows a demo's code. Default: "Show code". */
  showCode: string;
  /** The button that hides a demo's code. Default: "Hide code". */
  hideCode: string;
  /** Accessible name of a demo's expanded code. Default: "Code". */
  code: string;
  /** Shown while an isolated demo loads. Default: "Loading the demo.". */
  loading: string;
  /** Shown when an isolated demo did not load. Default: "The demo did not load.". */
  failed: string;
  /** The link next to `loading` and `failed`. Default: "Open it in a new tab". */
  openFrameInNewTab: string;
  /** The link of a demo with a fullscreen route. Default: "Open demo in a new tab". */
  openFullscreenRoute: string;
  /** The button that shows a demo fullscreen. Default: "Fullscreen". */
  fullscreen: string;
  /** The button that leaves fullscreen. Default: "Exit fullscreen". */
  exitFullscreen: string;
}

/**
 * The texts of the playgrounds (`NgDocPlaygroundComponent`) and their controls.
 */
export interface NgDocPlaygroundTexts {
  /** Title of the inspector. Default: "Playground". */
  title: string;
  /** The button that resets the inputs. Default: "Reset". */
  reset: string;
  /** The setting that recreates the demo on every change. Default: "Recreate". */
  recreate: string;
  /**
   * Description of the Recreate setting. Default: "Recreates the demo every time one of the inputs
   * changes".
   */
  recreateHint: string;
  /** Section of the content slots. Default: "Content". */
  content: string;
  /** Section of the inputs without a group. Default: "Settings". */
  settings: string;
  /** Marks the default value of a union type. Default: "default". */
  defaultValue: string;
  /** The button that resets a union type to its default. Default: "Reset to the default value". */
  resetToDefault: string;
}

/**
 * The texts of the navigation: the skip link, the navbar menu button, the sidebar, the
 * breadcrumbs and the links to the previous and next pages.
 */
export interface NgDocNavigationTexts {
  /** The link that skips to the page content. Default: "Skip to content". */
  skipToContent: string;
  /** The menu button while the sidebar is closed. Default: "Open navigation". */
  openMenu: string;
  /** The menu button while the sidebar is open. Default: "Close navigation". */
  closeMenu: string;
  /** Accessible name of the sidebar. Default: "Documentation". */
  sidebar: string;
  /** Accessible name of the breadcrumbs. Default: "Breadcrumb". */
  breadcrumbs: string;
  /**
   * Accessible name of the links to the previous and next pages. Default: "Previous and next
   * page".
   */
  pages: string;
  /** Label of the link to the previous page. Default: "Previous". */
  previous: string;
  /** Label of the link to the next page. Default: "Next". */
  next: string;
}

/**
 * The texts of a page (`NgDocPageComponent`): its controls and the way back from a fullscreen
 * route.
 */
export interface NgDocPageTexts {
  /** Accessible name of the copy link button. Default: "Copy link to this page". */
  copyLink: string;
  /** Accessible name of the copy link button after a copy. Default: "Link copied". */
  linkCopied: string;
  /** Tooltip of the copy link button. Default: "Copy link". */
  copyLinkTooltip: string;
  /** Tooltip of the copy link button after a copy. Default: "Copied". */
  linkCopiedTooltip: string;
  /** The link that edits the page source. Default: "Edit this page". */
  edit: string;
  /** Accessible name of the link to the page source. Default: "View the page source". */
  viewSource: string;
  /** Tooltip of the link to the page source. Default: "View source". */
  viewSourceTooltip: string;
  /**
   * The link from a fullscreen route back to its page. Default: "Back to {title}", or "Back to the
   * page" without a title.
   * Values: `title`, the title of the page, if any.
   */
  backTo: (params: { title?: string }) => string;
  /** Label of that link when the page has no title. Default: "Back". */
  back: string;
}

/**
 * The texts of the content of a page: images and code blocks.
 */
export interface NgDocContentTexts {
  /**
   * Accessible name of an image that opens larger. Default: "Open image: {alt}".
   * Values: `alt`, the text alternative of the image.
   */
  openImage: (params: { alt: string }) => string;
  /**
   * The highlighted lines in the header of a code block. Default: "Line 3", "Lines 6–7" or "Lines
   * 2, 5–6".
   * Values: `count`, the number of highlighted lines; `ranges`, the lines, such as "6–7".
   */
  codeLines: (params: { count: number; ranges: string }) => string;
}

/**
 * The texts of the table of contents (`NgDocTocComponent`).
 */
export interface NgDocTocTexts {
  /** Title of the declaration details of an API page. Default: "Symbol". */
  symbol: string;
  /** Title of the headings of the page. Default: "On this page". */
  onThisPage: string;
  /** Accessible name of the reading progress bar. Default: "Reading progress". */
  readingProgress: string;
  /** The button that scrolls to the top. Default: "Back to top". */
  backToTop: string;
  /** The button that copies the page link. Default: "Copy link". */
  copyLink: string;
  /** That button after a copy. Default: "Copied". */
  copied: string;
  /** The link that edits the page source. Default: "Edit this page". */
  edit: string;
}

/**
 * The texts of the theme button (`NgDocThemeToggleComponent`).
 */
export interface NgDocThemeTexts {
  /** The theme that follows the system. Default: "Auto". */
  auto: string;
  /** The light theme. Default: "Light". */
  light: string;
  /** The dark theme. Default: "Dark". */
  dark: string;
  /**
   * Accessible name of the button. Default: "{current} theme. Switch to {next}", with `next` in
   * lower case.
   * Values: `current` and `next`, the names of the current and the next theme.
   */
  label: (params: { current: string; next: string }) => string;
  /**
   * Tooltip of the button. Default: "{current} theme".
   * Values: `current`, the name of the current theme.
   */
  tooltip: (params: { current: string }) => string;
}

/**
 * The texts of the API list (`NgDocApiListComponent`).
 */
export interface NgDocApiListTexts {
  /** Title of the list, unless its `title` input sets one. Default: "API References". */
  title: string;
  /**
   * The summary under the title. Default: "{declarations} declarations in {scopes} scope(s).".
   * Values: `declarations` and `scopes`, the number of declarations and scopes.
   */
  summary: (params: { declarations: number; scopes: number }) => string;
  /** Placeholder of the filter. Default: "Filter by name". */
  filterPlaceholder: string;
  /**
   * Placeholder of the filter when declarations have descriptions. Default: "Filter by name or
   * description".
   */
  filterPlaceholderWithDescriptions: string;
  /** Accessible name of the filter. Default: "Filter declarations by name". */
  filterLabel: string;
  /**
   * Accessible name of the filter when declarations have descriptions. Default: "Filter
   * declarations by name or description".
   */
  filterLabelWithDescriptions: string;
  /** Label of the grouping buttons. Default: "Group by". */
  groupBy: string;
  /** Groups by declaration kind. Default: "Kind". */
  groupByKind: string;
  /** Groups by scope. Default: "Scope". */
  groupByScope: string;
  /** Accessible name of the kind filter. Default: "Filter by kind". */
  kindsLabel: string;
  /** The kind filter that shows every kind. Default: "All". */
  allKinds: string;
  /**
   * The note of a selected scope. Default: "Showing {scope} only.".
   * Values: `scope`, the name of the scope.
   */
  scopeNote: (params: { scope: string }) => string;
  /** The button that clears the scope. Default: "Show every scope". */
  showEveryScope: string;
  /** A declaration without a description. Default: "No description". */
  noDescription: string;
  /** Shown when nothing matches the filters. Default: "No declarations match.". */
  empty: string;
  /** Shown when the list did not load. Default: "The API list could not be loaded.". */
  failed: string;
}

/**
 * Every text that the NgDoc application shows to readers, grouped by feature: labels, tooltips,
 * placeholders, accessible names and messages. Content (titles, Markdown, API documentation) is
 * not part of it.
 *
 * A text with values is a function of a parameters object, so a translation can reorder the
 * values and pick plural forms. Change texts with `provideNgDocTexts`; the defaults are in
 * `NG_DOC_DEFAULT_TEXTS`.
 */
export interface NgDocTexts extends NgDocUiKitTexts {
  /** The navbar search and the search result list. */
  search: NgDocSearchTexts;
  /** The search palette. */
  searchPalette: NgDocSearchPaletteTexts;
  /** Copy buttons. */
  copy: NgDocCopyTexts;
  /** Demos. */
  demo: NgDocDemoTexts;
  /** Playgrounds. */
  playground: NgDocPlaygroundTexts;
  /** Skip link, menu button, sidebar, breadcrumbs and previous and next pages. */
  navigation: NgDocNavigationTexts;
  /** Page controls. */
  page: NgDocPageTexts;
  /** Images and code blocks in the page content. */
  content: NgDocContentTexts;
  /** The table of contents. */
  toc: NgDocTocTexts;
  /** The theme button. */
  theme: NgDocThemeTexts;
  /** The API list. */
  apiList: NgDocApiListTexts;
}

/**
 * Changes to `NgDocTexts`: any of its groups, each with any of its texts. Texts that are left out
 * keep their value.
 */
export type NgDocTextsOverrides = {
  readonly [Group in keyof NgDocTexts]?: Partial<NgDocTexts[Group]>;
};
