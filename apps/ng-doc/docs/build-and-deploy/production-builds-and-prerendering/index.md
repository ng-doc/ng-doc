---
keyword: ProductionBuildsPage
---

Build the documentation site for production, and prerender every page to static HTML for fast
loading and search engines.

## Prerequisites

- A working development setup with the new engine (`*DevServerAndBuildsPage`).
- For server-side rendering or prerendering: an application with Angular SSR set up, with
  `main.server.ts` and a server application configuration.

## 🚀 Build with the Vite host

`vite build` builds the application with the Vite host (`*ViteHostPage#build-for-production`).

To build the server bundle and prerender every route as well, describe the application with
`createNgDocApplicationPlugin`, including its `server` entry (`*ViteHostPage`). Then build with the
`@ng-doc/builder:vite-application` builder, which runs your Vite configuration for `ng build`:

```json name="angular.json"
"build": {
  "builder": "@ng-doc/builder:vite-application",
  "options": {
    "configFile": "vite.config.mjs",
    "outputPath": "dist/my-app"
  }
}
```

```bash
ng build
```

Without the Angular CLI, the `ng-doc` command runs the same steps:

```bash
npx ng-doc prerender --vite-config vite.config.mjs --output-path dist/my-app
```

Both run three steps:

1. The browser build, into `dist/my-app/browser`.
2. The server build of the `server` entry, into `dist/my-app/server/server.mjs`.
3. The prerender: every route is rendered into `dist/my-app/browser/<route>/index.html`, and the
   list of routes is written to `dist/my-app/prerendered-routes.json`.

The routes come from the application's router configuration, lazy children included. Routes with
parameters or wildcards have no single URL and are skipped: list their concrete URLs in the
`routes` option, or with `--routes`. The build fails if a route fails to render, and it lists what
the application logged as errors while rendering. `*BuildersReference#vite-builders` lists every
option.

`vite build --watch` isn't supported. Use the development server to work on pages.

## Demo pages

When the site has demo pages (`*IsolatedDemosPage`), the browser build also writes the page of the
demo application, ng-doc-demo.html, and the server build its server entry, demo-server.mjs.
The prerender renders every demo page into `dist/my-app/browser/demo-preview/<page route>/<demo name>/index.html`
and lists it in `prerendered-routes.json`. A demo that fails to render on the server doesn't fail
the build: its page is the demo application's page, which renders it in the browser, and the build
prints a warning. Without prerendering, every demo page is that page.

## Wait for content on the server

NgDoc loads page content asynchronously. Wrap the server bootstrap function with
`withNgDocContentReady`, so the server waits until the content is ready and fails the request if a
page's content failed:

```typescript name="main.server.ts" {2,9}
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { withNgDocContentReady } from '@ng-doc/app';

import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default withNgDocContentReady(bootstrap);
```

Without it, prerendered pages can miss their content.

## Host under a sub-path

If the site is served from a sub-path, such as `https://example.com/my-lib/`, build it with that
base href. On the server, NgDoc resolves its asset requests against the `<base href>` of the
document or `APP_BASE_HREF`, through `NG_REQUEST_BASE_PATH`.

To serve the documentation under a route of your application instead, such as `/docs`, set
`routePrefix` (`*ConfigurationReference`).

## 🌍 Hosting

A prerendered site is a folder of static files. Any static host works. Serve `index.html` for
routes that weren't prerendered, so that client-side navigation keeps working after a reload. With
the Vite host, `index.html` holds the prerendered home page: serve `index.csr.html`, the page
without prerendered content, instead.

### Hosts without a fallback

Some static hosts, such as a plain file server, can't serve `index.html` for any path. A reload of
a page that wasn't prerendered then returns 404. Prerender every page, or switch the router to hash
URLs (`/#/docs/getting-started`) with `withHashLocation()`, so the host only ever serves the root
`index.html`:

<!-- prettier-ignore -->
```typescript name="app.config.ts" {2,9}
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { NG_DOC_ROUTING } from '@ng-doc/generated';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      NG_DOC_ROUTING,
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    // The other NgDoc providers stay as they are.
  ],
};
```

Navigation, links in the content, search, the table of contents and the Copy link actions keep the
route after the `#`, so a copied link to a page or a section opens it on any host.

> **Warning**
> With hash URLs, build the site for the browser only, without server rendering or prerendering.
> The browser never sends the part after `#` to the server, so the server would render the root
> page for every URL, and prerendered `docs/<page>/index.html` files would never be requested.
> Search engines don't index pages behind `#` either: for a public site, prefer prerendering.

{% index false %}

## Related

- `*AppProvidersReference#server-side-rendering`
- `*LegacyBuildersPage`
- `*PerformanceAndCachingPage`

{% endindex %}

Next: `*ProgressOutputPage`
