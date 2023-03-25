# {{ NgDocPage.title }}

Categories allow you to structure your documentation not only at the sidebar but also at the routing
level because each child page or category will have a routing based on its parent

## Creating a category

All categories should have the file name `ng-doc.category.ts`, this helps to find these categories
in your code
and render them.
To create a category you can use special schematic, you can call it even without parameters,
it will ask questions and show hints for required properties. You can find all available options in
the interface `NgDocBuildCategorySchema`

```bash
ng g @ng-doc/builder:category
```

This command will create folder with you category name and generate `ng-doc.category.ts` file
inside.

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.category.ts` file should contain your category configuration,
the category configuration must correspond to the `NgDocCategory` type, you can read more about the
various
properties in the documentation for the type, below is an example of the minimum category
configuration.

```typescript
import {NgDocCategory} from '@ng-doc/core';

export const MyAwesomeCategory: NgDocCategory = {
	title: 'MyAwesomeCategory',
};

export default MyAwesomeCategory;
```

## See also

- `*EntitiesPage`
