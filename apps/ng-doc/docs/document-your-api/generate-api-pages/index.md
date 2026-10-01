---
keyword: GenerateApiPagesPage
---

NgDoc writes an API reference from your TypeScript code: a page for every exported class,
interface, function, type alias, enum and variable in the files you choose, and an index that
lists them. The pages read the types from the code and the text from your doc comments, so they
stay in step with your library.

## See it

Open the page of `NgDocThemeService` or `NgDocTagComponent`, or the index of this site's API,
`*ApiReferences`.

Every declaration, whatever its kind, gets the same symbol view:

- **Header:** the scope, a chip with the kind, such as `Class` or `Type alias`, modifiers such as
  `abstract`, and the name. Status callouts follow, titled **Deprecated**, **Experimental**,
  **Alpha** or **Beta**, when the doc comment has one of these tags.
- **Description:** the text of the doc comment.
- **Details:** the decorators as chips, the selectors, the generic types, and what the declaration
  extends and implements.
- **Declaration:** the declaration as code, without its body.
- **Extended by:** for a class, the classes that extend it, with their number.
- **Members:** one table for the members of a class, an interface, an object type or an enum.
- **Returns**, **Parameters** and **Overloads** for a function, then the notes, examples and usage
  notes of the doc comment (`*WriteDocCommentsPage`).

## Use it

1. Create `ng-doc.api.ts` in your project, by hand or with the schematic:

   ```bash
   ng g @ng-doc/builder:api
   ```

   {% include "../../shared/schematic-exec-path.md" %}

2. List the files to document in `scopes`. The paths are globs relative to the workspace root:

   ```typescript name="ng-doc.api.ts"
   import { NgDocApi } from '@ng-doc/core';

   const api: NgDocApi = {
     title: 'API Reference',
     scopes: [
       {
         name: 'my-library',
         route: 'my-library',
         include: 'libs/my-library/src/**/*.ts',
         exclude: 'libs/my-library/src/**/*.spec.ts',
       },
     ],
   };

   export default api;
   ```

{% include "../../shared/export-by-default.md" %}

Each scope is a group of the index, usually one package. NgDoc documents every exported declaration
of every included file, whether or not your public entry point re-exports it. To document only the
public API, include the entry point alone, such as `libs/my-library/src/index.ts`: NgDoc follows its
exports. A declaration whose doc comment has the `@internal` tag gets no page.

The pages live under the route of the API, `api` by default, then the kind and the scope's route,
such as `/api/classes/my-library/MyClass`. The fields of `NgDocApi` and `NgDocApiScope` are listed
in `*PageFilesReference#ngdocapi`.

## The members table

The table lists the constructor, properties, accessors and methods of a class, static ones in groups
of their own, and the properties, accessors, methods and call signatures of an interface.

- **Tabs** show one group at a time, with the number of its members. **Inherited** shows the
  members that come from a base class or interface.
- **Filter** shows the members whose name contains the text. Press `F` to focus it.
- A **row** shows the member's signature and description. Chips mark `protected`, `abstract`,
  `static`, `async` and `readonly` members, their decorators, and signal members declared with
  `input()`, `model()` or `output()`, with `required` for a required input. A note names the class
  that a member is inherited from, overrides or implements.
- A **method row** expands to its full signature, parameters, return value, examples and overloads.

A member without a doc comment takes the comment of the member it overrides or implements. Every
member keeps its anchor, so links such as `NgDocThemeService.set` open the page at its row.

## Details in the rail

On wide screens, the right rail shows the details of the declaration in a **Symbol** section above
**On this page**: the kind, the decorators, the selectors, the generic types, the heritage and the
scope. The table of contents gets them through its `details` input, `NgDocPageToc.details`. If you
replace the table of contents (`*PageSkeletonPage`), declare a `details` input to show them. A
component without it leaves them hidden, and the details in the content stay.

## Search

Declarations are part of the search (`*SearchPage`). With the new engine, the command palette also
shows the kind of each result, and its preview shows the declaration's signature, such as
`export class NgDocThemeService`, and the first paragraph of its description. The legacy builders
don't record them (`*UpgradeTo22Page#7-the-new-engine`).

## The index

The index lists every declaration by scope. Readers filter it by name, group it by kind or by
scope, and show one kind only. With the new engine, the index also shows the one-line summary of
each declaration, and the filter matches it too. The filter, the kind, the scope and the
grouping are kept in the query parameters, so you can link to a filtered index, such as
`*ApiReferences?type=Interface`.

To place the index in a category of your sidebar, set `category`:

```typescript name="ng-doc.api.ts" {2,6}
import { NgDocApi } from '@ng-doc/core';
import ReferenceCategory from '../reference/ng-doc.category';

const api: NgDocApi = {
  title: 'API Reference',
  category: ReferenceCategory,
  scopes: [
    {
      name: 'my-library',
      route: 'my-library',
      include: 'libs/my-library/src/index.ts',
    },
  ],
};

export default api;
```

To link to the index with a keyword, set `keyword`, then write it after an asterisk, as with page keywords.

## Several API files

You can have more than one `ng-doc.api.ts`, for example one per library. Give each a different
`route`: without one, they all use `api` and their pages conflict.

## Customize

The chips of `@Component`, `@Directive`, `@Injectable`, `@Pipe`, `@NgModule`, `@Input` and
`@Output`, and of signal inputs and outputs, take their hue from a variable:

```css name="styles.css"
:root {
  --ng-doc-component-decorator-background: #7c3aed;
  --ng-doc-injectable-decorator-background: #0891b2;
}
```

| Variable                                   | Default               |
| ------------------------------------------ | --------------------- |
| `--ng-doc-component-decorator-background`  | `--ng-doc-hue-brand`  |
| `--ng-doc-directive-decorator-background`  | `--ng-doc-hue-brand`  |
| `--ng-doc-injectable-decorator-background` | `--ng-doc-hue-violet` |
| `--ng-doc-pipe-decorator-background`       | `--ng-doc-hue-brand`  |
| `--ng-doc-ng-module-decorator-background`  | `--ng-doc-hue-brand`  |
| `--ng-doc-input-decorator-background`      | `--ng-doc-hue-brand`  |
| `--ng-doc-output-decorator-background`     | `--ng-doc-hue-brand`  |
| `--ng-doc-api-content-max-width`           | `880px`               |

`--ng-doc-api-content-max-width` caps the width of API pages and the index, which need more room
than guides.

## Gotchas

> **Warning**
> The symbol view is part of the new engine. The legacy builders render API pages with a section
> for each group of members instead of one table. Anchors and keywords are the same in both.

> **Note**
> The members table renders every member on the server, so the page reads well before the
> application starts. The tabs and the filter work once it has started.

{% index false %}

## Related

- `*WriteDocCommentsPage`
- `*EmbedApiInGuidesPage`
- `*PageFilesReference#ngdocapi`

{% endindex %}

Next: `*WriteDocCommentsPage`
