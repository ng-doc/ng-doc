---
keyword: BrowserTabTitlesPage
---

The browser tab shows the title of the page the reader is on. By default it is the page title, or
the tab title on a page with tabs. You can give a page a title of its own, or build every title
from the parts of the route: its categories, the page, the tab and the API declaration.

## 👀 See it

This site builds its titles with `provideNgDocTitle`. Look at the browser tab: it reads
"Browser tab titles · Customize | NgDoc". The title of an API page is the declaration name, for
example "NgDocPage · API | NgDoc".

## 🧰 Use it

### A title for one page

Set `title` in the page's `route`. It replaces the page title in the browser tab:

```typescript name="ng-doc.page.ts" {6-8}
import { NgDocPage } from '@ng-doc/core';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
  route: {
    title: 'Install the library',
  },
};

export default InstallationPage;
```

The sidebar, the breadcrumbs and the search still show the page `title`. A route title can also be
a resolver function, as for any Angular route.

### Titles for every page

Pass a function to `provideNgDocTitle` in the application configuration. It receives the parts of
the route and returns the title:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideNgDocTitle } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgDocTitle(({ categories, page, tab, api }) => {
      const parts = api ? [api, 'API'] : [tab, page, ...[...categories].reverse()];
      const title = parts.filter(Boolean).join(' · ');

      return title ? `${title} | My library` : 'My library';
    }),
  ],
};
```

This gives titles like "Installation · Getting started | My library". The function runs in an
injection context, so it can call `inject()`, for example to read a translated site name.

## 📋 Options

The function receives an `NgDocTitleContext`:

| Field        | Type                  | Value                                                                                                                         |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `categories` | `readonly string[]`   | The titles of the categories that contain the page, the outermost category first. Empty outside a category.                   |
| `page`       | `string \| undefined` | The title of the guide or of the API list. A `title` in the page's `route` replaces it. Not set on API pages.                 |
| `tab`        | `string \| undefined` | The title of the active tab, on a page with more than one tab. Not set on a tab titled like the page, usually the first.      |
| `api`        | `string \| undefined` | The name of the API declaration, on an API page.                                                                              |
| `title`      | `string \| undefined` | The title Angular would set: the title of the deepest route that has one. Use it for the routes of your app outside the docs. |
| `snapshot`   | `RouterStateSnapshot` | The router state, for anything else.                                                                                          |

Return `undefined` to keep the current title.

## 🚧 Gotchas

> **Note** > `provideNgDocTitle` sets Angular's `TitleStrategy`, so the function builds the title of every
> route of your application, not only the documentation. Outside the docs, `categories` is empty
> and `page`, `tab` and `api` are not set. An application has one title strategy: drop your own
> `TitleStrategy` provider when you use this one.

> **Note**
> The title is set when the page is rendered on the server too, so prerendered pages have it in
> their `<title>` element.

> **Note**
> On a page with tabs, the page's `route` belongs to every tab. A `title` in it therefore replaces
> the title on all of them; with `provideNgDocTitle`, `tab` still names the active tab.

{% index false %}

## Related

- `*AppProvidersReference#providengdoctitle`
- `*PagesAndCategoriesPage`

{% endindex %}

Next: `*DevServerAndBuildsPage`
