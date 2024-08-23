---
keyword: AutoGenerationPage
---

NgDoc can automatically generate documentation for your API, you just need to create a special
configuration file for that.

## API configuration file

API configuration file is a typescript file that has `ng-doc.api.ts` name and exports a
configuration of type `NgDocApi`.

You can create an API configuration file by creating a new file in your project root directory or by
running the schematic command below (all available options you can find in the interface
`NgDocBuildApiSchema`).

{% include "../../shared/schematic-exec-path.md" %}

```bash
ng g @ng-doc/builder:api
```

{% include "../../shared/export-by-default.md" %}

> **Note**
> The paths you pass to the `include` and `exclude` fields must be passed relative to your project
> root path

```typescript name="ng-doc.api.ts"
import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'API Reference',
  scopes: [
    {
      name: 'my-library-name',
      route: 'my-library',
      include: 'path/to/my-library/source/files/**/*.ts',
    },
  ],
};

export default api;
```

In the `include` field, you can specify a mask in order to add one or several files, you can also
specify the path to only one file (for example `index.ts`) that exports all public entities, NgDoc
will collect all declarations and generate documentation for them.

If you want to exclude some files you can use the `exclude` field, the same rules apply for it as
for
the `include` field.

## Adding a category

You can also add a category to it to better structure your documentation articles.

```typescript name="ng-doc.api.ts" {2,6}
import { NgDocApi } from '@ng-doc/core';
import MyAwesomeCategory from '../ng-doc.category';

const api: NgDocApi = {
  title: 'API Reference',
  category: MyAwesomeCategory,
  scopes: [
    {
      name: 'my-library-name',
      route: 'my-library',
      include: 'path/to/my-library/source/files/**/*.ts',
    },
  ],
};

export default api;
```

## Writing documentation for declarations

Documentation for declarations can be written in the source code using JSDoc comments. NgDoc will
parse these comments and generate documentation for them. JSDoc comments also support the Markdown
syntax, so you can use any of its functions to make your documentation more pretty.

## Multiple API configurations

By default, NgDoc is configured to work only with one API configuration file, but if it is necessary
you can create multiple API configurations files. For multiple API configurations, you need to
specify different value for the `route` field in the `ng-doc.api.ts` file otherwise you will
get a conflict between two API pages, because the `route` property is optional and if you don't
specify it, NgDoc will use `api` as a default value.
