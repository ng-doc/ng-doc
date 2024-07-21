---
keyword: PagesAndCategoriesPage
---

The creation of pages and categories in the documentation is considered in this section.

## Page

The page is a typescript file that has `ng-doc.page.ts` name and exports a configuration of
type `NgDocPage`.

You can create a page by creating a new file in your pages directory (the app `src` folder by
default) or by running the schematic command below (all available options you can find in the
interface `NgDocBuildPageSchema`):

{% include "../../shared/schematic-exec-path.md" %}

```bash
ng g @ng-doc/builder:page "Installation"
```

{% include "../../shared/export-by-default.md" %}

```ts name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
};

export default InstallationPage;
```

## Page tabs

The content of the page should be inside a `markdown` file specified in the `mdFile` property of the
page configuration. You can also specify paths to multiple files, so NgDoc will display them as
multiple tabs on the page.

> **Warning**
> Even when using tabs, you still need to use `index.md`, it will be used as the first tab and
> should not contain the `route` configuration. Therefore, if you navigate to the page, `index.md`
> will be displayed by default.

```ts name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: ['./index.md', './nx.md'],
};

export default InstallationPage;
```

The `title`, `icon`, `route`, and other parameters for a tab can be specified within the file
itself using metadata (check the `MarkdownEntry` interface to see all available properties):

```md name="nx.md"
---
title: Nx
icon: Nx
route: nx
keyword: InstallationNxPage
---

## Running CLI commands

To run a CLI command, use the following command...
```

## Category

Categories are used to structure your documentation and group pages. Every category is a typescript
file that has `ng-doc.category.ts` name and exports a configuration of type `NgDocCategory`.

You can create a category by creating a new file in your categories directory (the app `src`
folder by default) or by running the schematic command below (all available options you can find in
the interface `NgDocBuildCategorySchema`):

{% include "../../shared/schematic-exec-path.md" %}

```bash
ng g @ng-doc/builder:category "Getting Started"
```

{% include "../../shared/export-by-default.md" %}

```ts name="ng-doc.category.ts"
import { NgDocCategory } from '@ng-doc/core';

const GettingStartedCategory: NgDocCategory = {
  title: 'Getting Started',
};

export default GettingStartedCategory;
```

## Adding pages to a category

To add a page to a category, you can use the `category` field in the page configuration. Just import
the category and put it in the `category` field, like this:

```ts name="ng-doc.page.ts" {2,7}
import { NgDocPage } from '@ng-doc/core';
import GettingStartedCategory from '../ng-doc.category';

const InstallationPage: NgDocPage = {
  title: 'Installation',
  mdFile: './index.md',
  category: GettingStartedCategory,
};

export default InstallationPage;
```

## See also

- `*MarkdownSyntaxPage`
