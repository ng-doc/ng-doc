// Attributed differences between the legacy and the new engine's production output of the same
// checkout. Each one is intended; anything else fails `parity.mjs`.
export const KNOWN = {
  keywords: {
    /** Keywords only the new engine exports. */
    added: [],
    /** `key: { legacy, current }` for keywords both engines export differently. */
    changed: {},
  },
  search: {
    /**
     * Fields only the new engine writes: the summary of an API declaration (kind, signature and
     * description) on the records of its page that belong to no section. The legacy comparison
     * leaves them out of the new engine's rows; the accepted sets keep them.
     */
    fields: ['kind', 'signature', 'description'],
    /**
     * Routes of the pages the new engine renders in the symbol view (every API declaration): one
     * members table whose group rows are the headings, so their records belong to other sections
     * than in the legacy per-section layout. For these pages the legacy comparison requires every
     * legacy text of the page to be indexed on it (page, title and breadcrumbs included), in any
     * section; the accepted sets hold the exact rows.
     */
    symbolView: /^docs\/api\/(classes|interfaces|functions|type-aliases|variables|enums)\//,
    /** Search rows only the new engine indexes. */
    added: [],
    /** Legacy search rows the new engine does not index. */
    removed: [],
  },
  routes: {
    /** `**\/index.html` routes only the new engine builds. */
    added: [
      // Isolated demos have pages of their own, which only the new engine builds.
      'demo-preview/docs/demos-and-playgrounds/isolated-demos/ViewportDemoComponent/index.html',
      // The page of each target of each playground of a guide with an isolated playground.
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/a-ng-doc-button-flat/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/a-ng-doc-button-text/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/a-ng-doc-button/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/button-ng-doc-button-flat/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/button-ng-doc-button-text/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/ButtonPlayground/button-ng-doc-button/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/DatePipePlayground/formatdate/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/RotatorPlayground/ngdocrotator/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/TagCloudPlayground/ng-doc-tag-cloud/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/TagDataPlayground/ng-doc-tag/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/TagIconPlayground/ng-doc-tag/index.html',
      'demo-preview/docs/demos-and-playgrounds/playgrounds/playground/TagPlayground/ng-doc-tag/index.html',
    ],
    /** Legacy routes the new engine does not build (onlyForTags removals are derived). */
    removed: [],
    /**
     * Routes one new-engine host builds and another does not: the Vite host prerenders every
     * concrete route of the application's router, including the category routes that redirect
     * to their first page. Either all of them are built or none.
     */
    optional: [
      'docs/index.html',
      'docs/build-and-deploy/index.html',
      'docs/customize/index.html',
      'docs/demos-and-playgrounds/index.html',
      'docs/document-your-api/index.html',
      'docs/get-started/index.html',
      'docs/reference/index.html',
      'docs/upgrade/index.html',
      'docs/write-content/index.html',
    ],
  },
};
