---
keyword: InstallationPage
---

Add NgDoc to an Angular application with one command. NgDoc runs inside your application, so you
can start from a new Angular project or add it to an existing one.

## Prerequisites

- An Angular 22 application, any release (`*UpgradeTo22Page#prerequisites`). Both engines use the
  application's own Angular build tools. The command chooses the engine from the application
  ([Add NgDoc](#add-ngdoc)).
- Vite 8 for the Vite engine, which the command adds for you (see below).
- Node.js 24 (`>=24.15.0 <25`).

The examples use `npm`. Any package manager works.

## 📦 Add NgDoc

Run the command for your workspace. It installs the NgDoc packages and configures the application
for you.

```bash group="install" name="Angular CLI" icon="angular"
ng add @ng-doc/add
```

```bash group="install" name="Nx" icon="nx"
npm install @ng-doc/add && npx nx g @ng-doc/add:ng-add
```

The command chooses the engine from the application:

- **The Vite engine** (`*ViteHostPage`) for a standalone application, one that calls
  `bootstrapApplication`, whose `build` target uses Angular's `application` builder
  (`@angular/build:application` or `@angular-devkit/build-angular:application`). `ng new` creates
  such an application.
- **The legacy builders** (`*LegacyBuildersPage`) for an NgModule application, one that calls
  `bootstrapModule`, and for an application whose `build` target uses another builder, such as
  `@nx/angular:application` or the `browser` builder. The command says so in its output.
- **The builders it already has** for a project that uses NgDoc: `ng add` never switches the engine,
  even with `--engine`. `ng g @ng-doc/builder:migrate-to-vite` moves a project from the legacy
  builders (`*MigrateToNewEnginePage`).
- **No NgDoc builder** for an application whose `build` or `serve` target uses a builder that is
  neither Angular's nor NgDoc's, such as `@angular-architects/native-federation:build` or a custom
  builder: replacing it would break the application. The command keeps the builders, sets up the
  rest (the styles, assets and budget go to the target with the Angular build options, such as the
  `esbuild` target of native federation) and links to
  `*DevServerAndBuildsPage#keep-another-builder`, which generates the documentation with the
  `ng-doc` command next to your builder.

To choose yourself, pass `--engine` (see the options below). `--engine legacy` sets up the legacy
builders in any project that doesn't use NgDoc yet, in place of any builder. `--engine vite` stops with an error in an
application that the Vite engine can't build (`*LegacyBuildersPage#when-ng-add-sets-them-up`).

## 🚀 Start the site

Start the development server:

```bash
ng serve
```

You should see an empty documentation site with a navigation bar and a sidebar. It is empty because
there are no pages yet. `*YourFirstPage` adds the first one.

{% include "../../shared/generated-folder.md" %}

## 📋 Command options

| Option                  | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `--project=<name>`      | The application to set up. Defaults to the default project or the first one with a `build`.    |
| `--engine=vite\|legacy` | The engine to set up. Without it, the command chooses as described in [Add NgDoc](#add-ngdoc). |

## What the command changed

With the Vite engine (`*ViteHostPage`), the command changes these files. With the legacy builders,
the targets, styles, assets and budgets change in another way, and Vite, `vite.config.mjs` and the
server entry are left alone (`*LegacyBuildersPage#when-ng-add-sets-them-up`):

- **Packages:** it adds `@ng-doc/app`, `@ng-doc/builder`, `@ng-doc/ui-kit` and `@ng-doc/core`, and
  removes `@ng-doc/add`. It also adds `vite` `^8.3.0` and `@analogjs/vite-plugin-angular` `^2.8.0`
  to `devDependencies` when `package.json` doesn't list them
  (`*BuildersReference#supported-versions`), so npm installs their newest releases. If
  `package.json` already has a `vite` that can't resolve to Vite 8.3 or later, the command keeps it
  and warns, because the Vite engine doesn't start with it
  (`*TroubleshootingPage#ngdoc_vite_version`); update it with `npm i -D vite@^8.3.0`.
- **Targets:** the `build` target uses `@ng-doc/builder:vite-application` and the `serve` target
  uses `@ng-doc/builder:vite-dev-server`, both with `vite.config.mjs`
  (`*BuildersReference#vite-builders`). Each build configuration, such as `production`, selects the
  Vite mode with the same name. The original build options move to a new `build-angular` target:
  Angular builders that read them, such as `unit-test` and `extract-i18n`, now point at it.
- **`vite.config.mjs`:** a new file in the project folder, written from the build options: the
  application (`browser`, `server`, `polyfills`, `styles`, `assets`), the Analog Angular plugin and
  the engine settings (`*ViteHostPage`). Edit it freely; `ng add` doesn't overwrite it.
- **Styles and assets:** it adds the NgDoc global styles and asset folders to the build options, so
  they are in `vite.config.mjs` too. The Vite plugin serves the generated assets itself.
- **Server entry:** in an SSR application, it wraps the default export of `main.server.ts` with
  `withNgDocContentReady`, so `ng build` prerenders each page once its content is ready
  (`*ProductionBuildsPage`).
- **TypeScript:** it maps `@ng-doc/generated` to `ng-doc/<project-name>/index.ts` and enables
  `allowSyntheticDefaultImports`.
- **Git:** it adds `/ng-doc` and `/.cache/ng-doc` to `.gitignore`, because those folders are
  generated.
- **Application:** it adds the NgDoc providers to the application configuration (`app.config.ts`).
  It replaces the root component template with the NgDoc layout and adds `NgDocRootComponent`,
  `NgDocNavbarComponent` and `NgDocSidebarComponent` to the root component's imports.

The command prints the build options that the Vite engine doesn't use, such as `budgets`, and the
ones that need a change by hand. An application created with `ng new --ssr` renders pages on
request (`outputMode: 'server'` with `src/server.ts`). The Vite engine builds the server bundle and
prerenders every route instead, so deploy the `browser` folder as a static site.

The command stops, and changes no file but `package.json`, when the Vite engine can't build the
application. It tells you why: the application is localized (`localize`), the index file isn't
named `index.html`, the root component can't be found, or `vite.config.mjs` or a `build-angular`
target already exists. Fix the cause and run the command again.

The generated routes are added to the router that your application already has, so
`provideRouter(routes)` becomes:

```typescript
provideRouter([...routes, ...NG_DOC_ROUTING], withInMemoryScrolling(...));
```

Inline routes get `...NG_DOC_ROUTING` before a trailing wildcard route; for routes kept in a
variable, the command warns you if they end with one, so that you can move it. An existing
`provideHttpClient(...)` call keeps its features and gets `withInterceptorsFromDi()` if it does
not pass it yet.

The command never registers the router or the HTTP client a second time. If an earlier version of
`ng add` left two `provideRouter` or `provideHttpClient` calls, they are merged into one, without
the deprecated `withFetch()`. You can run the command again on a configured project, and it
changes nothing. When it cannot edit something safely (for example, `providers` or router options
held in a variable), it leaves that code as it is and tells you what to add by hand.

> **Note**
> NgDoc works with and without zone.js. `ng add` adds no change-detection provider and no `zone.js`
> polyfill, so a zoneless application (the default since Angular 21) stays zoneless, and an
> application that uses `provideZoneChangeDetection()` keeps it. It does not add `withFetch()`
> either: `HttpClient` uses the Fetch API by default since Angular 22.

## Manual setup

Use these steps if you can't run `ng add`, or if you want to see what each part does. They set up
the same files as the command.

### 1. Install the packages

```bash
npm install @ng-doc/core @ng-doc/builder @ng-doc/ui-kit @ng-doc/app
npm install vite @analogjs/vite-plugin-angular --save-dev
```

Install the `vite` and `@analogjs/vite-plugin-angular` versions listed in
`*BuildersReference#supported-versions`.

To link to external APIs such as Angular or RxJS, also install the optional keyword loaders
(`*LinkToExternalApisPage`):

```bash
npm install @ng-doc/keywords-loaders --save-dev
```

### 2. Ignore the generated folder

NgDoc writes generated code into a folder in your workspace and rewrites it on every build, and
keeps its cache next to it. Don't commit them:

```gitignore name=".gitignore"
# NgDoc files
/ng-doc
/.cache/ng-doc
```

### 3. Map `@ng-doc/generated`

Your application imports the generated routes and context from `@ng-doc/generated`. Map that path to
the generated folder in the application's `tsconfig.json`:

```json name="tsconfig.json"
{
  "compilerOptions": {
    "paths": {
      "@ng-doc/generated": ["./ng-doc/<project-name>/index.ts"],
      "@ng-doc/generated/*": ["./ng-doc/<project-name>/*"]
    }
  }
}
```

`<project-name>` is the name of your application project, for example `docs`.

### 4. Add the providers

Add the NgDoc providers to the application configuration. The router uses the generated routes, and
the HTTP client needs `withInterceptorsFromDi()` because NgDoc registers an HTTP interceptor. NgDoc
works with and without zone.js, so keep the change-detection setup that your application already
has.

<!-- prettier-ignore -->
```typescript name="app.config.ts"
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import {
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NG_DOC_DEFAULT_PAGE_SKELETON,
  NgDocDefaultSearchEngine,
  provideMainPageProcessor,
  provideNgDocApp,
  providePageSkeleton,
  provideSearchEngine,
} from '@ng-doc/app';
import { NG_DOC_ROUTING, provideNgDocContext } from '@ng-doc/generated';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      NG_DOC_ROUTING,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withInterceptorsFromDi()),
    provideNgDocContext(),
    provideNgDocApp(),
    provideSearchEngine(NgDocDefaultSearchEngine),
    providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
    provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
  ],
};
```

`*AppProvidersReference` describes every provider and its options. To preload pages before the
reader opens them, add `withPreloading(NgDocPreloadingStrategy)` to `provideRouter`
(`*AppProvidersReference#preload-pages`).

### 5. Add the layout

Render the NgDoc layout in the root component:

```typescript name="app.ts"
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgDocNavbarComponent, NgDocRootComponent, NgDocSidebarComponent } from '@ng-doc/app';

@Component({
  selector: 'app-root',
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
export class App {}
```

### 6. Set up the Vite engine

Create `vite.config.mjs` and point the `build` and `serve` targets at the Vite builders, as
`*ViteHostPage` shows. Pass the NgDoc styles and assets to `createNgDocApplicationPlugin`: the global
styles and the dark theme, which the theme toggle switches to, go before your own stylesheet.

```js name="vite.config.mjs"
createNgDocApplicationPlugin({
  // browser, server, polyfills, ...
  styles: [
    'node_modules/@ng-doc/app/styles/global.css',
    'node_modules/@ng-doc/app/styles/themes/dark.css',
    'src/styles.css',
  ],
  assets: [
    { glob: '**/*', input: 'public' },
    { glob: '**/*', input: 'node_modules/@ng-doc/app/assets', output: 'assets/ng-doc/app' },
    { glob: '**/*', input: 'node_modules/@ng-doc/ui-kit/assets', output: 'assets/ng-doc/ui-kit' },
  ],
}),
```

The Vite plugin serves the generated assets itself, so they need no entry.

### 7. Wait for content on the server

In an application with server-side rendering, wrap the default export of `main.server.ts` with
`withNgDocContentReady`, so that each page is prerendered once its content has loaded
(`*AppProvidersReference#server-side-rendering`):

```typescript name="main.server.ts" {2,9}
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { withNgDocContentReady } from '@ng-doc/app';

import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default withNgDocContentReady(bootstrap);
```

{% index false %}

## Related

- `*HowNgDocWorksPage`
- `*ConfigurationReference`
- `*TroubleshootingPage`

{% endindex %}

Next: `*YourFirstPage`
