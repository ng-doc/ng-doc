---
keyword: HowNgDocWorksPage
---

NgDoc is a code generator for an Angular application. It reads your documentation files, turns them
into Angular code, and your application serves that code like any other route.

## 🔧 The pipeline

Every build goes through the same four steps, in the development server and in a production build.

```mermaid
flowchart LR
  discover["Discover"] --> render["Render"]
  render --> link["Link"]
  link --> write["Write"]
```

1. **Discover.** NgDoc loads the configuration file (`ng-doc.config.ts`) and finds every page
   (`ng-doc.page.ts`), category (`ng-doc.category.ts`) and API file (`ng-doc.api.ts`) in the
   documentation folder.
2. **Render.** It renders each page's Markdown and Nunjucks into HTML, including demos and
   playgrounds. It analyses your TypeScript sources and renders a page for every declaration in an
   API scope.
3. **Link.** It collects keywords from all pages and declarations and turns matching inline code
   into links.
4. **Write.** It writes the result into the generated folder: page components, routes, search
   indexes and assets.

## Guide pages and API pages

NgDoc produces two kinds of pages:

- **Guide pages** come from `ng-doc.page.ts` and its Markdown files. You write them.
- **API pages** come from the scopes in `ng-doc.api.ts`. NgDoc generates one for every exported
  class, interface, function, type alias, enum and variable, and an API list page for the whole
  API. The doc comments in your code become the text of these pages.

`*PagesAndCategoriesPage` and `*GenerateApiPagesPage` explain both.

## The generated folder

By default, the builders write the generated code to `ng-doc/<project-name>` in the workspace root.
The `ng-doc` command uses `.ng-doc/<project-name>` instead.
`outDir` in the configuration file changes the parent folder (`*ConfigurationReference`).

Your application imports the generated code through the `@ng-doc/generated` path:

- `NG_DOC_ROUTING` holds the routes of every page;
- `provideNgDocContext()` provides the sidebar navigation and other site data.

The folder is rewritten on every build, so don't edit it and don't commit it.

## Development server and production build

- The **development server** generates the site, then watches your files. When you save a page, a
  component or a doc comment, NgDoc regenerates only what depends on that file and the page
  updates.
- A **production build** generates every page once. Angular then builds the application, and can
  prerender every route to static HTML (`*ProductionBuildsPage`).

## Where keywords come from

A keyword is a name that NgDoc turns into a link:

- the `keyword` in a page's front matter, and the headings of that page;
- the name of every declaration in an API scope, such as `NgDocPage`, and its members;
- the global keywords and keyword loaders in the configuration file.

`*LinksAndKeywordsPage` shows how to use them.

## What is cached

The new engine stores generated results in a cache and reuses them when their inputs haven't
changed. The cache is on by default and lives in `.cache/ng-doc/<project-name>`. The legacy builders
keep their own cache, which is off by default. `*PerformanceAndCachingPage` covers both.

## Two engines

NgDoc 22.0 ships two engines that produce the same site:

- the **legacy builders** (`@ng-doc/builder:application` and `@ng-doc/builder:dev-server`), which
  `ng update` keeps existing projects on;
- the **new engine**, which adds a Vite development host, a command line interface and faster
  rebuilds. `ng add` sets it up for a new standalone application; for an existing project it is
  opt-in.

Guide pages, demos, playgrounds and API pages work the same in both. `*MigrateToNewEnginePage`
explains how to switch, and `*LegacyBuildersPage` lists what is specific to the legacy builders.

Next: `*PagesAndCategoriesPage`
