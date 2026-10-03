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

## Build with the Angular CLI builder

The new engine's Angular CLI builder accepts every option of the Angular `application` builder. Use
Angular's `server`, `ssr` and `prerender` options as you would without NgDoc, then run:

```bash
ng build
```

NgDoc generates every page once before Angular builds the application.

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

{% index false %}

## Related

- `*AppProvidersReference#server-side-rendering`
- `*LegacyBuildersPage`
- `*PerformanceAndCachingPage`

{% endindex %}

Next: `*ProgressOutputPage`
