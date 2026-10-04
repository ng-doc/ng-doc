---
keyword: AppProvidersReference
---

The providers that configure the documentation application, and the APIs for server-side
rendering. Add the providers to your application configuration
(`*InstallationPage#4-add-the-providers`).

## Providers

| Provider                                         | Package             | Required     | Description                                                                          |
| ------------------------------------------------ | ------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `provideNgDocContext()`                          | `@ng-doc/generated` | Yes          | Provides the generated navigation and site data.                                     |
| `provideNgDocApp(config?)`                       | `@ng-doc/app`       | Yes          | Configures the application. See `*AppProvidersReference#providengdocapp`.            |
| `provideSearchEngine(engine, ...args)`           | `@ng-doc/app`       | For search   | Provides the search engine (`*SearchPage`).                                          |
| `providePageSkeleton(skeleton)`                  | `@ng-doc/app`       | Yes          | Sets the components around the page content (`*PageSkeletonPage`).                   |
| `provideMainPageProcessor(processors)`           | `@ng-doc/app`       | Yes          | Registers the main processors, usually `NG_DOC_DEFAULT_PAGE_PROCESSORS`.             |
| `providePageProcessor(processors)`               | `@ng-doc/app`       | –            | Registers your own processors, after the main ones (`*CustomPageComponentsPage`).    |
| `provideTypeControl(type, control, options?)`    | `@ng-doc/app`       | –            | Registers a playground control for a type (`*CustomTypeControlsPage`).               |
| `providePlaygroundDemo(playgroundId, component)` | `@ng-doc/app`       | –            | Registers the component of a playground. Generated code calls it; you don't need to. |
| `provideMermaid(config?)`                        | `@ng-doc/app`       | For diagrams | Enables Mermaid diagrams (`*DiagramsPage`).                                          |
| `provideNgDocTitle(titleFn)`                     | `@ng-doc/app`       | –            | Builds the browser tab titles (`*BrowserTabTitlesPage`).                             |

The routes of the site are in `NG_DOC_ROUTING`, also from `@ng-doc/generated`. The application
also needs the Angular router and `provideHttpClient(withInterceptorsFromDi())`, because NgDoc
registers an HTTP interceptor.

## provideNgDocApp

`provideNgDocApp(config?: NgDocApplicationConfig)`. See also `NgDocApplicationConfig`.

| Option                             | Type                               | Default      | Description                                                                                                                  |
| ---------------------------------- | ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `contentAnchorScrolling`           | `boolean`                          | `false`      | Scrolls to the anchor in the URL again after NgDoc content has loaded. Use it with the router's `anchorScrolling`.           |
| `contentScrollPositionRestoration` | `'enabled' \| 'top' \| 'disabled'` | `'disabled'` | Restores the scroll position after NgDoc content has loaded. Use the same value as the router's `scrollPositionRestoration`. |
| `uiKit`                            | `NgDocUiConfig`                    | See below    | Paths of the UI kit assets.                                                                                                  |
| `shiki`                            | `NgDocHighlighterConfig`           | –            | Extra Shiki themes (`themes`) and languages (`langs`) to load in the browser. `theme` is deprecated and ignored.             |
| `shortcuts`                        | `boolean`                          | `true`       | Whether single-key shortcuts are on for readers who haven't chosen (`*SearchPage#keyboard-shortcuts`). ⌘K always works.      |

`NgDocUiConfig` has two fields. Set both when you pass `uiKit`:

| Field             | Default                  | Description                                  |
| ----------------- | ------------------------ | -------------------------------------------- |
| `assetsPath`      | `'assets/ng-doc/ui-kit'` | Where the UI kit assets are served.          |
| `customIconsPath` | `'assets/icons'`         | Where your own SVG icons are (`*IconsPage`). |

The site uses the two scrolling options with the matching router options:

```typescript name="app.config.ts"
provideNgDocApp({
  contentAnchorScrolling: true,
  contentScrollPositionRestoration: 'enabled',
});
```

## provideSearchEngine

`provideSearchEngine(engine, ...args)` creates the engine class with the given arguments. The
default engine is `NgDocDefaultSearchEngine`, and its first argument is an
`NgDocDefaultSearchEngineOptions` object:

| Option      | Type                             | Default | Description                                                 |
| ----------- | -------------------------------- | ------- | ----------------------------------------------------------- |
| `stemmer`   | A stemmer from `@orama/stemmers` | –       | Stems words. Without it, words are not stemmed.             |
| `limit`     | `number`                         | `10`    | The most results to return.                                 |
| `tolerance` | `number`                         | –       | The number of typos to allow. It doesn't work with `exact`. |
| `exact`     | `boolean`                        | –       | Returns only exact matches.                                 |

The engine returns the matching guides first, then the matching API pages, each in order of
relevance. Guides take up to half of `limit`, or more when fewer API pages match, and API pages
fill the rest.

```typescript name="app.config.ts"
provideSearchEngine(NgDocDefaultSearchEngine, { limit: 20 });
```

To use another engine, extend `NgDocSearchEngine` and pass your class.

## providePageSkeleton

`providePageSkeleton(skeleton: NgDocPageSkeleton)`. There is no default skeleton: pass
`NG_DOC_DEFAULT_PAGE_SKELETON` for the standard components, or your own object.

| Field         | Type                         | In `NG_DOC_DEFAULT_PAGE_SKELETON` |
| ------------- | ---------------------------- | --------------------------------- |
| `breadcrumbs` | `Type<NgDocPageBreadcrumbs>` | `NgDocBreadcrumbComponent`        |
| `navigation`  | `Type<NgDocPageNavigation>`  | `NgDocPageNavigationComponent`    |
| `toc`         | `Type<NgDocPageToc>`         | `NgDocTocComponent`               |

Leave a field out to remove that part of the page.

## provideNgDocTitle

`provideNgDocTitle(titleFn: NgDocTitleFn)` sets a `TitleStrategy` that builds the title of every
navigation with `titleFn`. The function receives an `NgDocTitleContext` with the `categories`,
`page`, `tab` and `api` of the route and the default `title`, and returns the title, or
`undefined` to keep the current one. See `*BrowserTabTitlesPage`.

```typescript name="app.config.ts"
provideNgDocTitle(({ page, title }) => (page ? `${page} | My library` : title));
```

## Page processors

`provideMainPageProcessor(processors)` registers the processors you pass. Pass
`NG_DOC_DEFAULT_PAGE_PROCESSORS` for the standard ones, which render links, icons, heading anchors,
callouts, tooltips, diagrams, code blocks, demos, demo panes, playgrounds, tabs, images and the
members tables of API pages.
`providePageProcessor(processors)` adds your own, which run after the main processors. Each
processor is an `NgDocPageProcessor`:

| Field            | Type                                          | Description                                    |
| ---------------- | --------------------------------------------- | ---------------------------------------------- |
| `component`      | `Type<T>`                                     | The component that replaces the element.       |
| `selector`       | `string`                                      | The CSS selector of the elements to replace.   |
| `extractOptions` | `(element, root) => NgDocProcessorOptions<T>` | Reads the inputs and content from the element. |
| `nodeToReplace`  | `(element, injector) => Element`              | Chooses another element to replace. Optional.  |

## provideTypeControl

`provideTypeControl(type: string, control, options?)` registers a playground control for inputs of
the given type name.

| Option         | Type      | Description                                                        |
| -------------- | --------- | ------------------------------------------------------------------ |
| `hideLabel`    | `boolean` | Hides the input name next to the control.                          |
| `order`        | `number`  | The position of the control. The built-in controls use 10 to 40.   |
| `labelWrapper` | `boolean` | Wraps the row in a `<label>` (default). `false` renders a `<div>`. |

## Preload pages

A page's code and content load when the reader opens it. To have them ready before that, set
`NgDocPreloadingStrategy` as the router's preloading strategy:

```typescript name="app.config.ts"
provideRouter(routes, withPreloading(NgDocPreloadingStrategy));
```

NgDoc then preloads a page when the reader points at, focuses or touches a link to it anywhere on
the site: in the sidebar, the previous and next page links, the page content, the search results
and the table of contents. After a guide renders, its previous and next guides are preloaded once
the browser is idle. Each page is preloaded once, and only the pages the reader is about to open:
the strategy never loads every page, as `PreloadAllModules` would. Nothing is preloaded on the
server, when the reader has turned on data saving, or on a 2G connection. `NgDocRoutePreloader`
also preloads a page on demand, with `preload(url)`.

Without the strategy, pages still open without a blank page in between: the router keeps the
current page on screen until the next page and its content have loaded.

## Server-side rendering

| API                     | Package          | Description                                                                                                                                     |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `withNgDocContentReady` | `@ng-doc/app`    | Wraps the server bootstrap function. It waits until NgDoc content has loaded, and fails the render if content failed.                           |
| `NgDocContentState`     | `@ng-doc/app`    | The content failures of the current request. `withNgDocContentReady` reads it.                                                                  |
| `NG_REQUEST_BASE_PATH`  | `@ng-doc/ui-kit` | The base path of the current request: the `<base href>` or `APP_BASE_HREF` on the server, `''` in the browser. NgDoc uses it to request assets. |

Wrap the bootstrap function in `main.server.ts`:

```typescript name="main.server.ts" {2,9}
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { withNgDocContentReady } from '@ng-doc/app';

import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default withNgDocContentReady(bootstrap);
```

Without it, the server can return a page before its content has loaded. `*ProductionBuildsPage`
describes prerendering.

{% index false %}

## Related

- `*InstallationPage`
- `*ConfigurationReference`
- `*ProductionBuildsPage`

{% endindex %}
