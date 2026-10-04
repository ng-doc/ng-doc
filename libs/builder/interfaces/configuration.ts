import { NgDocDemoProvidersImport, NgDocHeading, NgDocKeywordsLoader } from '@ng-doc/core';
import { NgDocGlobalKeyword } from '@ng-doc/core/interfaces/keyword-map';

import { NgDocRepoConfig } from './repo-config';

/**
 * NgDoc configuration interface, that configure NgDoc library
 */
export interface NgDocConfiguration {
  /**
   * Determines whether to use the cache or not. (enabled by default)
   */
  cache?: boolean;
  /**
   * Paths to your documentation location (e.g. "src/app")
   */
  docsPath?: string;

  /**
   * The path to the output directory, where the documentation will be generated. (e.g. 'src')
   *
   * Remember that if you change this path, you also need to change the following:
   * - Change the path to the `@ng-doc/generated` directory in `tsconfig.json`
   * - Change the path to the `ng-doc/app-name/assets` folder in `angular.json`
   */
  outDir?: string;
  /**
   * Route prefix uses to add some additional route segment before documentation pages,
   * you can use it e.g. to wrap documentation with additional route like "docs".
   */
  routePrefix?: string;
  /**
   * The configuration for the global keywords.
   */
  keywords?: NgDocKeywordsConfiguration;
  /**
   * The repository configuration.
   * If it is defined, Ngoc will use it to display the "Suggest edits" button, and "View source" button, on each page.
   */
  repoConfig?: NgDocRepoConfig;
  /**
   * The path to the tsconfig file (NgDoc uses tsconfig of your application by default, but you can override it)
   */
  tsConfig?: string;
  /**
   * The configuration for the guides
   */
  guide?: NgDocGuideConfiguration;
  /**
   * The configuration for the API pages. Only the Vite engine reads it.
   */
  api?: NgDocApiConfiguration;
  /**
   * Shows every demo of the `demo` action in an iframe, as `isolated: true` does for one demo
   * (`false` by default). It also builds a demo page for every demo. Only the Vite engine reads it.
   */
  isolatedDemos?: boolean;
  /**
   * The demo pages: one page per demo that loads only Angular and that demo, which isolated demos
   * show in an iframe and "Open in new tab" opens. Only the Vite engine builds them.
   *
   * By default only the pages with an isolated demo get them. `true` (or an object) builds them for
   * every page with demos; `false` never builds them, and isolated demos render in the page.
   */
  demoApplication?: boolean | NgDocDemoApplicationConfiguration;
  /**
   * Imports the module whose default export lists the providers of the demo pages, for example
   * `() => import('./demo.providers')`. It must be written in `ng-doc.config.ts` as an arrow
   * function that returns one `import()` of a file. NgDoc never calls it while it generates; the
   * demo pages import the module. Only the Vite engine reads it.
   */
  demoProviders?: NgDocDemoProvidersImport;
  /**
   * Shiki configuration
   */
  shiki?: {
    themes: {
      light: string;
      dark: string;
    };
    /**
     * Shiki language registrations that code blocks can use in addition to the languages bundled
     * with Shiki, such as a grammar imported from a `.tmLanguage.json` file or from
     * `@shikijs/langs`. A registration named like a bundled language replaces it. Only the Vite
     * engine reads it; load the same languages in the browser with `provideNgDocApp`.
     */
    langs?: Array<NgDocShikiLanguage | readonly NgDocShikiLanguage[]>;
  };
}

/**
 * A Shiki (TextMate) language registration: a grammar and the name that code blocks use for it.
 * It must be plain JSON data, as in a `.tmLanguage.json` file or a module of `@shikijs/langs`.
 */
export interface NgDocShikiLanguage {
  /** The language name: code blocks that name it (for example ` ```my-lang `) use the grammar. */
  name: string;
  /** The root scope of the grammar, such as `source.my-lang`. */
  scopeName: string;
  /** The name to display for the language. */
  displayName?: string;
  /** Other names that code blocks can use for the language. */
  aliases?: string[];
  /** The languages that the grammar embeds, which must be bundled or registered too. */
  embeddedLangs?: string[];
  /** The languages that the grammar embeds when they are loaded. */
  embeddedLangsLazy?: string[];
  /** The scopes that the grammar injects itself into. */
  injectTo?: string[];
  /** The TextMate rules of the grammar. */
  patterns?: unknown;
  /** The named TextMate rules that `patterns` include. */
  repository?: unknown;
  /** TextMate injections. */
  injections?: unknown;
  /** The selector of an injection grammar. */
  injectionSelector?: string;
}

/**
 * The configuration for the guide page
 */
export interface NgDocGuideConfiguration {
  /**
   * Defines a list of the heading levels for which the anchor will be generated.
   */
  anchorHeadings?: NgDocHeading[];
  /**
   * Path from the project root to the header HTML template file.
   * It can be used to customize the header of the guide page.
   */
  headerTemplate?: string;
}

/**
 * The configuration for the API pages.
 */
export interface NgDocApiConfiguration {
  /**
   * Whether API pages list the protected members of classes, inherited ones included
   * (`true` by default). With `false`, they list only public members: hidden members get no row,
   * anchor, search record or keyword.
   */
  protectedMembers?: boolean;
}

/**
 * The configuration of the demo pages.
 */
export interface NgDocDemoApplicationConfiguration {
  /**
   * The URL path under which the demo pages are served, relative to the base href
   * (`demo-preview` by default): a demo's page is `<base href><path>/<page route>/<demo name>/`.
   * One or more URL segments of letters, digits, `-`, `_` and `.`; the first character of a
   * segment is a letter or a digit, because some static hosts skip folders that start with `_`
   * or `.`.
   */
  path?: string;
}

/**
 * The configuration for the global keywords.
 */
export interface NgDocKeywordsConfiguration {
  /**
   * List of async loaders that will be used to load the global keywords.
   */
  loaders?: NgDocKeywordsLoader[];
  /**
   * List of the global keywords, to create link to foreign websites
   */
  keywords?: Record<string, NgDocGlobalKeyword>;
}
