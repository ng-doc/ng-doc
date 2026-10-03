---
keyword: PagesAndCategoriesPage
---

A page is a folder with a configuration file and Markdown content. Categories group pages in the
sidebar. Use them to shape the navigation of your site.

## 👀 See it

The sidebar of this site is built from pages and categories. This page is **Write content ›
Pages and categories**, and these are the two files behind it.

The category, `write-content/ng-doc.category.ts`:

```typescript name="ng-doc.category.ts" file="../ng-doc.category.ts"

```

The page, `write-content/pages-and-categories/ng-doc.page.ts`:

```typescript name="ng-doc.page.ts" file="./ng-doc.page.ts"

```

## 🧰 Create a page

A page is a file named `ng-doc.page.ts` that default-exports an `NgDocPage` object. Its content
lives in the Markdown file that `mdFile` points to.

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
};

export default InstallationPage;
```

You can also generate the page folder, with both files, from the command line:

```bash
ng g @ng-doc/builder:page "Installation"
```

The schematic creates the folder in the current directory. Pass `--path` to create it somewhere
else.

The page's route is the folder name. Set `route` to change it.

## Create a category

A category is a file named `ng-doc.category.ts` that default-exports an `NgDocCategory` object.

```typescript name="ng-doc.category.ts"
import { NgDocCategory } from '@ng-doc/core';

const GuidesCategory: NgDocCategory = {
  title: 'Guides',
  order: 1,
  expandable: true,
};

export default GuidesCategory;
```

Or generate it:

```bash
ng g @ng-doc/builder:category "Guides"
```

To put a page in the category, import the category and set it as the page's `category`:

```typescript name="ng-doc.page.ts" {2,7}
import { NgDocPage } from '@ng-doc/core';
import GuidesCategory from '../ng-doc.category';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
  category: GuidesCategory,
};

export default InstallationPage;
```

A category can also belong to another category through its own `category` field. Its route is
the folder name, and the routes of its pages start with it.

## Order and visibility

| Field         | On                | Effect                                                                                    |
| ------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `order`       | pages, categories | Sorts items in the sidebar, lowest first.                                                 |
| `expandable`  | categories        | Lets readers collapse the category. When `false`, it is always open.                      |
| `expanded`    | categories        | Opens the category when the site loads. It also opens when the current page is inside it. |
| `hidden`      | pages, categories | Removes the item from the sidebar. Its route still works.                                 |
| `route`       | pages, categories | Replaces the folder name in the URL.                                                      |
| `onlyForTags` | pages, categories | Renders the item only for builds with a matching tag (see below).                         |

`*PageFilesReference` lists every field.

## Page description

A doc comment on the page configuration becomes the page description. NgDoc shows it under the page
title, above every tab. It supports Markdown.

```typescript name="ng-doc.page.ts" {3-5}
import { NgDocPage } from '@ng-doc/core';

/**
 * Install the library and add it to your application.
 */
const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
};

export default InstallationPage;
```

## Page tabs

Give `mdFile` several files to show them as tabs. The first file is the default tab.

```typescript name="ng-doc.page.ts" {5}
import { NgDocPage } from '@ng-doc/core';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: ['./index.md', './nx.md'],
};

export default InstallationPage;
```

Each other tab needs a `route` in its front matter. The `title` is the tab label.

```markdown name="nx.md"
---
title: Nx
route: nx
keyword: InstallationNxPage
---

Run the command below in an Nx workspace.
```

| Front matter | Effect                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `title`      | The tab label. The page title is used by default.                      |
| `route`      | The tab route, added to the page route. Leave it out on the first tab. |
| `keyword`    | The page keyword, used to link to this page or tab.                    |
| `icon`       | An icon for the tab.                                                   |

This page has tabs too: the first tab is `index.md`, labelled with the page title, and **Tab
example** is `tab-example.md`, with its own route (`*PageTabsExample`).

Tabs hide content from the table of contents. Use them only when readers pick one variant, and
make a separate page otherwise.

## Status badges

Add a `@status` tag to the page's doc comment to show a badge in the sidebar. Write the color after
a colon, then the text.

```typescript name="ng-doc.page.ts" {4}
import { NgDocPage } from '@ng-doc/core';

/**
 * @status:info NEW
 */
const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
};

export default InstallationPage;
```

The colors are the values of `NgDocColor`: `primary`, `info`, `success`, `warning`, `alert` and
`link`. The sidebar of this site shows `@status:info NEW` on `*YourFirstPage`.

## Build tags

`onlyForTags` keeps a page or category only in builds that have one of the listed tags. Use it for
internal pages, such as a sandbox that only developers need.

```typescript name="ng-doc.page.ts" {6}
import { NgDocPage } from '@ng-doc/core';

const SandboxPage: NgDocPage = {
  title: 'Sandbox',
  mdFile: './index.md',
  onlyForTags: ['development'],
};

export default SandboxPage;
```

A build's tags come from its configuration name, so `development` and `production` work without
setup:

| Entry point          | Tags by default                                                       | Set them with              |
| -------------------- | --------------------------------------------------------------------- | -------------------------- |
| Angular CLI builders | The configuration name, or names, of the target                       | The `ngDoc.tags` option    |
| Vite host            | The Vite mode: `development` for the server, `production` for a build | `generator.discovery.tags` |
| `ng-doc` command     | `production` for `generate`, `development` for `dev` and `watch`      | `--tags a,b`               |

- An entry without `onlyForTags` is always kept. `null` and `''` also mean no filter.
- An entry with `onlyForTags` is kept only if the build has at least one of its tags. A build
  without tags leaves it out, and `[]` leaves the entry out of every build. A single string counts
  as one tag.
- When a category is left out, its pages, child categories and API pages are left out too.
- A left-out entry has no route, sidebar item, search entry or keyword.

Don't link to a tagged page from a page that every build keeps. When a build leaves the target out,
the link has nothing to point to, and the build fails with `CONTENT_KEYWORD_FILTERED`. The message
names the page, the tags that left it out and the tags of the build.

A value of `onlyForTags` that isn't a string or an array of strings fails with
`DISCOVERY_INVALID_ENTRY`. Build tags must be non-empty strings. The `ng-doc` command rejects an
empty tag in `--tags` with a usage error (exit code `2`), and the Angular CLI builders reject one in
`ngDoc.tags` before they start. With the Vite plugin, `generator.discovery.tags` that aren't an
array of non-empty strings fail the build with `DISCOVERY_TAGS_INVALID`.

## 🚧 Gotchas

{% include "../../shared/export-by-default.md" %}

> **Warning**
> Only the new engine reads `onlyForTags`. The legacy builders ignore it and show every page
> (`*LegacyBuildersPage`).

{% index false %}

## Related

- `*PageFilesReference`
- `*LinksAndKeywordsPage`
- `*TemplatesPage`

{% endindex %}

Next: `*MarkdownAndCalloutsPage`
