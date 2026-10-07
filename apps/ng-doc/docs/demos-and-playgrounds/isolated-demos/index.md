---
keyword: IsolatedDemosPage
---

An isolated demo runs on a page of its own, which loads only Angular and the demo, and the
documentation page shows that page in an iframe. The preview widths are then the width of the
demo's viewport, so its media queries respond to them, and the documentation page's layout, styles
and providers don't reach the demo: it gets your global styles only. Isolated demos are part of the
new engine.

## 👀 See it

{{ NgDocActions.demo("ViewportDemoComponent", { isolated: true }) }}

Switch the preview to 480 or 280 pixels: the card puts its cover on top, because its media query
now sees a narrow viewport. The **Open in a new tab** button of the toolbar opens the demo's page,
with the demo alone on it.

The same demo, rendered in the page, keeps its wide layout at every width, because the width
buttons only resize its frame:

{{ NgDocActions.demo("ViewportDemoComponent") }}

It has the **Open in a new tab** button too: when a page has an isolated demo, every demo of the
page gets its own page.

## 🧰 Use it

Show one demo in an iframe with the `isolated` option of `demo`:

```twig name="index.md"
{{ '{{ NgDocActions.demo("ViewportDemoComponent", { isolated: true }) }}' | safe }}
```

Or isolate every demo of the site in `ng-doc.config.ts`, and keep one in the page with
`isolated: false`:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  isolatedDemos: true,
};

export default config;
```

To give every demo its own page, and the **Open in a new tab** button, without showing them in
iframes, set `demoApplication: true`.

### Providers

A demo page gets the providers of its page and of the page's categories, as the demo has them on
the documentation page, but none of the documentation application's. When your demos need more,
such as `HttpClient` or animations, list them in a module of your own and import it with
`demoProviders`:

```typescript name="demo.providers.ts"
import { provideHttpClient } from '@angular/common/http';
import { NgDocDemoProviders } from '@ng-doc/core';

const providers: NgDocDemoProviders = [provideHttpClient()];

export default providers;
```

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  isolatedDemos: true,
  demoProviders: () => import('./demo.providers'),
};

export default config;
```

`demoProviders` is typed, so a module whose default export isn't a list of providers is a type
error. NgDoc never runs it while it generates: it reads the path of the module from the function,
and the demo pages import the module in the browser and on the server.

The demo pages also load your application's global styles, the `styles` of the application, and
they follow the theme the reader picks on the documentation site.

### The pages of the demos

A demo's page is `<base href>demo-preview/<page route>/<demo name>/`, for example
`/demo-preview/docs/demos-and-playgrounds/isolated-demos/ViewportDemoComponent/`. The `inputs`
option of the demo travels in its `inputs` query parameter. To serve the pages under another path,
set `demoApplication.path`:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  demoApplication: { path: 'examples/live' },
};

export default config;
```

The path is one or more URL segments of letters, digits, `-`, `_` and `.`. A segment can't start
with `_` or `.`, because some static hosts skip such folders.

The development server serves the demo pages, and an edit of a demo updates it in its iframe
without reloading the page. A production build prerenders them with the rest of the site, so a
static host serves them as files (`*ProductionBuildsPage#demo-pages`).

## 📋 Options

The option of the `demo` action:

| Option     | Type      | Default         | Description                                                     |
| ---------- | --------- | --------------- | --------------------------------------------------------------- |
| `isolated` | `boolean` | `isolatedDemos` | Shows the demo in an iframe of its page instead of in the page. |

The options of `ng-doc.config.ts` (`*ConfigurationReference#demo-pages`):

| Option            | Type                                           | Default | Description                                                                                |
| ----------------- | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `isolatedDemos`   | `boolean`                                      | `false` | Shows every demo in an iframe, unless its `isolated` option is `false`.                    |
| `demoApplication` | `boolean \| NgDocDemoApplicationConfiguration` | –       | `true` gives every demo a page. `false` gives none, and isolated demos render in the page. |
| `demoProviders`   | `NgDocDemoProvidersImport`                     | –       | Imports the module whose default export lists the providers of the demo pages.             |

Without any of them, only the pages with an isolated demo get demo pages.

## 🚧 Gotchas

> **Warning**
> Only the new engine builds demo pages. With the legacy builders, an isolated demo renders in the
> page, and demos have no **Open in a new tab** button (`*LegacyBuildersPage`).

> **Warning**
> An overlay that a demo opens, such as a menu, a tooltip or a dialog, can't leave the iframe. Keep
> such demos in the page, or let readers open them in a new tab.

> **Note**
> Write `demoProviders` as an arrow function that returns one `import()` of a file, such as
> `() => import('./demo.providers')`. NgDoc reports any other form. The dynamic imports of
> `ng-doc.config.ts` are left to the browser: none of them runs while NgDoc generates.

> **Note**
> Each isolated demo starts Angular in its own iframe. The iframes load when they come near the
> viewport, but a page with many isolated demos uses more memory than with demos in the page.

> **Note**
> Playgrounds and demo panes always render in the page.

> **Note**
> A demo that fails to render on the server gets the page without prerendered content, which
> renders it in the browser, and the build prints a warning (`NGDOC_PRERENDER_DEMO_FALLBACK`).
> Without prerendering, the build writes that page for every demo, so a static host serves them
> without a fallback.

{% index false %}

## Related

- `*DemosPage`
- `*DemoPanePage`
- `*ConfigurationReference`

{% endindex %}
