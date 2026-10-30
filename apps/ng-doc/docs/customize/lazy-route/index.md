---
keyword: LazyRoutePage
---

When the documentation is one part of a larger application, such as a product with a `/docs`
section, load NgDoc with the route that holds the documentation. Give that route all the NgDoc
providers: NgDoc starts when the reader opens the documentation, and none of its code is in the
bundle that the rest of your application loads at start.

## 👀 See it

The application below keeps its own pages at the root and loads the documentation lazily under
`/docs`. Its start-up bundle holds Angular, the router and its own pages only:

- NgDoc's components, services and providers are in the chunk of the `/docs` route.
- Shiki, the code highlighter of playgrounds, loads when the documentation starts.
- Orama, the engine of the default search, loads when the reader first searches.

The scroll offset of anchors and the keyboard shortcuts of NgDoc apply only while the
documentation layout is shown. Your other pages keep their own scroll offset and their own keys.

## 🧰 Use it

### 1. Set the route prefix

NgDoc generates the links between pages, so it needs to know the route. Set `routePrefix` in the
configuration file (`*ConfigurationReference`):

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  routePrefix: 'docs',
};

export default config;
```

### 2. Create the documentation route

Create a component for the documentation layout, and a routes file that gives the route the NgDoc
providers. These are the providers that the installation guide adds to the application
(`*InstallationPage#4-add-the-providers`), moved to the route:

<!-- prettier-ignore -->
```typescript name="docs.routes.ts"
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet, Routes } from '@angular/router';
import {
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NG_DOC_DEFAULT_PAGE_SKELETON,
  NgDocDefaultSearchEngine,
  NgDocNavbarComponent,
  NgDocRootComponent,
  NgDocSidebarComponent,
  provideMainPageProcessor,
  provideNgDocApp,
  providePageSkeleton,
  provideSearchEngine,
} from '@ng-doc/app';
import { NG_DOC_ROUTING, provideNgDocContext } from '@ng-doc/generated';

@Component({
  selector: 'app-docs',
  imports: [RouterOutlet, NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent],
  template: `
    <ng-doc-root>
      <ng-doc-navbar>
        <span ngDocNavbarLeft>My library</span>
      </ng-doc-navbar>
      <ng-doc-sidebar />
      <router-outlet />
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {}

const routes: Routes = [
  {
    path: '',
    providers: [
      provideNgDocContext(),
      provideNgDocApp(),
      provideSearchEngine(NgDocDefaultSearchEngine),
      providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
      provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
    ],
    component: DocsComponent,
    children: NG_DOC_ROUTING,
  },
];

export default routes;
```

Add the other NgDoc providers that you use, such as `provideMermaid` or `provideTypeControl`, to
the same list.

### 3. Load it lazily

The application configuration keeps only what belongs to the whole application: the router with
the lazy route, and the HTTP client.

<!-- prettier-ignore -->
```typescript name="app.config.ts"
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(
      [...routes, { path: 'docs', loadChildren: () => import('./docs/docs.routes') }],
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
  ],
};
```

`routes` holds your own pages, such as the home page at `''`. Import nothing from `@ng-doc/app` or
`@ng-doc/generated` in the files that the application loads at start, or that code moves back into
the start-up bundle. The root component keeps your application's shell: `ng add` doesn't replace
a root template that your application wrote.

### Root-only providers

Two NgDoc features configure the router, which reads them from the application's providers only.
Both are optional when the documentation is one part of the application:

- `provideNgDocTitle` sets the router's `TitleStrategy` (`*BrowserTabTitlesPage`). Without it,
  Angular sets the title of the deepest route that has one, which on a documentation page is the
  page title.
- `NgDocPreloadingStrategy` preloads pages before the reader opens them
  (`*AppProvidersReference#preload-pages`). Add it to `provideRouter` with
  `withPreloading(NgDocPreloadingStrategy)`, and give the application the route prefix too, so it
  preloads only documentation pages:

<!-- prettier-ignore -->
```typescript name="app.config.ts"
import { provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';
import { NG_DOC_ROUTE_PREFIX, NgDocPreloadingStrategy } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    { provide: NG_DOC_ROUTE_PREFIX, useValue: 'docs' },
    provideRouter(
      [...routes, { path: 'docs', loadChildren: () => import('./docs/docs.routes') }],
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withPreloading(NgDocPreloadingStrategy),
    ),
  ],
};
```

Both bring a small part of NgDoc into the start-up bundle.

### Keep your application header

`ng-doc-root` draws its navbar at the top of the window. If your application shows a header above
the documentation that stays at the top of the window (`position: fixed`), make room for it with
`--ng-doc-layout-top`: the navbar, the sidebar, the sticky parts of a page and the scroll offset of
anchors start below it.

```css name="docs.component.css"
:host {
  --ng-doc-layout-top: 64px;
}
```

To show only your own header, leave the navbar out of `ng-doc-root`: without navbar content, the
layout has no header bar. Put the search in your header with `NgDocSearchComponent`, or use your
header as the navbar (`*LayoutPage#custom-navbar`).

## ⚙️ How it works

`provideNgDocApp` starts NgDoc with environment initializers, which run where the providers are:
in the application's injector, or in the injector that the router creates for the documentation
route when the reader first opens it. The services that read NgDoc's providers are created in that
injector too. The server render waits until the code highlighter has loaded, so prerendered pages
are the same as with the providers in the application. Server-rendered pages that the browser
hydrates show their content while it loads, also when the documentation is the first page the
reader opens.

`ng-doc-root` sets the router's scroll offset and turns the keyboard shortcuts on while it is shown.
When the reader leaves the documentation, the offset that your application set comes back and the
shortcuts stop. A layout of your own that doesn't use `ng-doc-root` turns the shortcuts on with
`NgDocShortcutsService.listen()`.

## 🚧 Gotchas

> **Note**
> Keep `provideHttpClient` in the application's providers. NgDoc loads its icons and the API lists
> of the search with the application's HTTP client.

> **Note**
> Can the documentation be left out of a production build? There is no NgDoc flag for it, because
> the documentation is a part of your application like any other. Put it in a project of its own,
> such as a `docs` application in the same workspace that imports your library, and build and
> deploy that project separately. Or swap the routes file in a build configuration with
> `fileReplacements`: a `docs.routes.ts` that exports no routes leaves the documentation out of
> that build's bundles. NgDoc still generates the documentation during the build; only a project of
> its own keeps it out of the build completely.

{% index false %}

## Related

- `*LayoutPage`
- `*AppProvidersReference`
- `*ProductionBuildsPage`

{% endindex %}
