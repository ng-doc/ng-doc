---
keyword: 'EntitiesAPI'
---

The API entity is one of the most powerful features in NgDoc, it allows you to generate an API pages
for any entities in your project, it can be classes, interfaces, functions, variables, or anything
else.

## Creating an API

To create an API entity, you can use a special schematic, it will generate `ng-doc.metadata.ts` file for
you in the current directory.

{% include "../../shared/schematic-exec-path.md" %}

```bash
ng g @ng-doc/builder:metadata
```

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.metadata.ts` file should contain your API configuration,
the API configuration must correspond to the `NgDocApi` type.

Let's see how an example of a basic API configuration looks like.

> **Note**
> The paths you pass to the `include` and `exclude` fields must be passed relative to your project
> root path

```typescript name="ng-doc.metadata.ts"
import { NgDocApi } from '@ng-doc/core';

const metadata: NgDocApi = {
  title: 'API Reference',
  scopes: [
    {
      name: 'my-library-name',
      route: 'my-library',
      include: 'path/to/my-library/source/files/**/*.ts',
    },
  ],
};

export default metadata;
```

In the `include` field, you can specify a mask in order to add one or several files, you can also
specify the path to only one file (for example `index.ts`) that exports all public entities, NgDoc
will collect all declarations and generate documentation for them.

If you want to exclude some files you can use the `exclude` field, the same rules apply for it as
for
the `include` field.

## Adding a category

Don't like that the API section is at the top? You can also add a category to it to better
structure your documentation articles.

```typescript name="ng-doc.metadata.ts" {2,6}
import { NgDocApi } from '@ng-doc/core';
import MyAwesomeCategory from '../ng-doc.category';

const metadata: NgDocApi = {
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

export default metadata;
```

## Writing documentation for declarations

As mentioned above, NgDoc will generate documentation for all exported declarations it finds using
the `include` field, to see how you can write documentation for various declarations, see
the `*ContentApiTemplating` article.

## Multiple API configurations

By default, NgDoc is configured to work only with one API configuration file, but if it is necessary
you can create multiple API configurations files. For multiple API configurations, you need to
specify different value for the `route` field in the `ng-doc.metadata.ts` file otherwise you will
get a conflict between two API pages, because the `route` property is optional and if you don't
specify
it, NgDoc will use `metadata` as a default value.

{% index false %}

## See also

- `*EntitiesCategory`
- `*ContentApiTemplating`

{% endindex %}
