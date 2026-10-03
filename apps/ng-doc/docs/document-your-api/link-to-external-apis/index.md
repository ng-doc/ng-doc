---
keyword: LinkToExternalApisPage
---

Keyword loaders link the names of other libraries' APIs to their documentation. NgDoc calls them
when it starts, and every name they return works like a global keyword: written in inline code or in
a code block, it becomes a link.

## 👀 See it

This site loads the keywords of Angular and RxJS, so these names are links:

```markdown name="index.md"
Inject `ChangeDetectorRef` in a `@Component`, and `switchMap` over an `Observable`.
```

Inject `ChangeDetectorRef` in a `@Component`, and `switchMap` over an `Observable`.

## 🧰 Use it

1. Install the loaders:

   ```bash
   npm i @ng-doc/keywords-loaders --save-dev
   ```

2. Add them to `keywords.loaders` in `ng-doc.config.ts`:

   ```typescript name="ng-doc.config.ts"
   import { NgDocConfiguration } from '@ng-doc/builder';
   import { ngKeywordsLoader, rxjsKeywordsLoader } from '@ng-doc/keywords-loaders';

   const config: NgDocConfiguration = {
     keywords: {
       loaders: [ngKeywordsLoader(), rxjsKeywordsLoader()],
     },
   };

   export default config;
   ```

3. Write the names in inline code or in code blocks, as you do for your own API.

## Built-in loaders

| Loader                         | Links to                         | Keywords                                                                                       |
| ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ngKeywordsLoader(options?)`   | The API reference of angular.dev | Every API entry, such as `Component` and `ChangeDetectorRef`, and `@Component` for decorators. |
| `rxjsKeywordsLoader(version?)` | The API reference of rxjs.dev    | Every API entry, such as `Observable` and `switchMap`.                                         |
| `ngDocKeywordsLoader(options)` | Another site built with NgDoc    | The API keywords of that site, and optionally its page keywords.                               |

The Angular loader links only the API reference, not the guides or tutorials.

### Versions

The Angular and RxJS loaders link the latest documentation. To link the documentation of another
version, pass the version subdomain: `ngKeywordsLoader({ version: 'v19' })` loads
`https://v19.angular.dev`, and `rxjsKeywordsLoader('v6')` loads `https://v6.rxjs.dev`.

### Another NgDoc site

`ngDocKeywordsLoader` loads the keywords that another NgDoc site publishes in
`assets/ng-doc/keywords.json`:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { ngDocKeywordsLoader } from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [
      ngDocKeywordsLoader({
        endpoint: 'https://docs.example.com',
        loadGuides: true,
        guidesPrefix: 'ExtraDoc',
      }),
    ],
  },
};

export default config;
```

| Option         | Type      | Default          | Description                                                                 |
| -------------- | --------- | ---------------- | --------------------------------------------------------------------------- |
| `endpoint`     | `string`  | required         | The URL of the site.                                                        |
| `assetsPath`   | `string`  | `/assets/ng-doc` | The path of the site's NgDoc assets, for a site that serves them elsewhere. |
| `loadGuides`   | `boolean` | `false`          | Loads the page keywords of the site too.                                    |
| `guidesPrefix` | `string`  | –                | Prefixes the page keywords, so they don't clash with yours.                 |

With these options, a page of that site with the keyword `Installation` is linked as
`ExtraDocInstallation`, after an asterisk, and anchors work as with your own pages:

```markdown name="index.md"
See `*ExtraDocInstallation`, or `*ExtraDocInstallation#manual-setup`.
```

## Write a loader

A loader is a function that returns a promise of keywords, `NgDocKeywordsLoader`. Each keyword is an
`NgDocGlobalKeyword`: its `url`, and an optional `title` to show instead of the name and
`description` to show on hover.

```typescript name="my-keywords-loader.ts"
import { NgDocKeywordsLoader } from '@ng-doc/core';

export function myKeywordsLoader(): NgDocKeywordsLoader {
  return async () => {
    const response = await fetch('https://example.com/api-index.json');
    const names: string[] = await response.json();

    return Object.fromEntries(names.map((name) => [name, { url: `https://example.com/api/${name}` }]));
  };
}
```

Add it to `keywords.loaders` like the built-in ones:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

import { myKeywordsLoader } from './my-keywords-loader';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [myKeywordsLoader()],
  },
};

export default config;
```

For a few links that never change, use global keywords instead (`*LinksAndKeywordsPage#global-keywords`).

## When loaders run

NgDoc calls the loaders when it starts, and again when it rebuilds everything, for example after an
edit of `ng-doc.config.ts` or of a page's `.ts` file. While you only edit the content of pages, it keeps
the keywords they loaded last, so an external site isn't requested on every save.

With the new engine, a loader that throws, or that doesn't finish within 10 seconds, fails the
build with `DISCOVERY_KEYWORD_LOADER_FAILED`. The Angular and RxJS loaders don't throw: when their
site can't be reached, they log the error and load no keywords, and the names stay plain code.
`ngDocKeywordsLoader` throws, so the build fails when the other site can't be reached.

## 🚧 Gotchas

> **Warning**
> When two sources define the same keyword, the last one wins, and the new engine reports
> `KEYWORD_DUPLICATE`. The loaders come first, in the order of `keywords.loaders`, then the global
> keywords, then your pages and API. Use `guidesPrefix` to keep the page keywords of another NgDoc
> site apart from yours.

To choose between two loaders, define the keyword in `keywords.keywords`. A global keyword replaces
the loader keywords of the same name without a warning, so the link no longer depends on the order
of the loaders. For example, the Angular loader (Signal Forms) and the RxJS loader both define
`debounce`, `min` and `max`:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { ngKeywordsLoader, rxjsKeywordsLoader } from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [ngKeywordsLoader(), rxjsKeywordsLoader()],
    keywords: {
      debounce: { url: 'https://rxjs.dev/api/operators/debounce' },
    },
  },
};

export default config;
```

With the new engine, a global keyword also chooses between your own API and the loaders, or
between two of your API pages with the same name: when its `url` is the route of one of your
pages, such as `/docs/api/functions/core/asArray`, that page keeps the keyword without a warning.
When a global keyword replaces a loader keyword with a route that no page or API declaration of the
build has any more, the build warns with `KEYWORD_PIN_UNRESOLVED`. The legacy engine doesn't check the route: there, your pages and API
always win over global keywords.

> **Note**
> Builds that load keywords need network access. Without it, the Angular and RxJS names aren't
> linked, and a loader that throws fails the build.

{% index false %}

## Related

- `*LinksAndKeywordsPage`
- `*ConfigurationReference#keywords`
- `*DiagnosticCodesReference`

{% endindex %}

Next: `*LayoutPage`
