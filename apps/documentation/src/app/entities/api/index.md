# {{ NgDocPage.title }}

The API entity is one of the most powerful features in NgDoc, it allows you to generate an API pages
for any entities in your project, it can be classes, interfaces, functions, variables, or anything
else.

## Creating an API

> **Warning**
> NgDoc does not support loading multiple `ng-doc.api.ts` files, all your APIs must be
> listed in **one** file.

To create an API entity, you can use a special schematic, it will generate `ng-doc.api.ts` file for
you in the current directory.

```bash
ng g @ng-doc/builder:api
```

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.api.ts` file should contain your API configuration,
the API configuration must correspond to the `NgDocApi` type.

Let's see how an example of a basic API configuration looks like.

> **Note**
> The paths you pass to the `include` and `exclude` fields must be passed relative to your project root path

```typescript
import {NgDocApi} from '@ng-doc/builder';

export const api: NgDocApi = {
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

Don't like that the API section is at the top? You can also add a category to it to better
structure your documentation articles.

```typescript
// ng-doc.category.ts
import {NgDocCategory} from '@ng-doc/builder';

export const MyAwesomeCategory: NgDocCategory = {
	title: 'MyAwesomeCategory',
}

export default MyAwesomeCategory;
```

```typescript
// ng-doc.api.ts
import {NgDocApi} from '@ng-doc/builder';
import MyAwesomeCategory from '../ng-doc.category';

export const api: NgDocApi = {
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

As mentioned above, NgDoc will generate documentation for all exported declarations it finds using
the `include` field, to see how you can write documentation for various declarations, see
the `ContentDeclarations` article.

## See also

- `EntitiesCategory`
- `ContentDeclarations`
