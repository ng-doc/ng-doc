---
keyword: PageFilesReference
---

The fields of the three entity files: `ng-doc.page.ts`, `ng-doc.category.ts` and `ng-doc.api.ts`,
and the front matter of Markdown files. Each entity file must default-export one object.

## NgDocPage

The default export of `ng-doc.page.ts`. See `NgDocPage` and `*PagesAndCategoriesPage`.

| Field                     | Type                                    | Default         | Description                                                                                                                                                     |
| ------------------------- | --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                   | `string`                                | required        | The page title in the header and the sidebar.                                                                                                                   |
| `mdFile`                  | `string \| string[]`                    | required        | The Markdown file, or several files shown as tabs. Paths are relative to the page.                                                                              |
| `category`                | `NgDocCategory`                         | –               | The category that contains the page.                                                                                                                            |
| `order`                   | `number`                                | –               | The position in the sidebar, lowest first.                                                                                                                      |
| `route`                   | `string \| Route`                       | The folder name | The route segment, or an Angular `Route` object. Use `route.children` for fullscreen demos.                                                                     |
| `hidden`                  | `boolean`                               | `false`         | Removes the page from the sidebar. The route still works.                                                                                                       |
| `onlyForTags`             | `string[]`                              | –               | Keeps the page only in builds with one of these tags. A build's tags default to its configuration name (`*PagesAndCategoriesPage#build-tags`). New engine only. |
| `data`                    | `unknown`                               | –               | Any data, available in the page template as `NgDocPage.data`.                                                                                                   |
| `imports`                 | `Component['imports']`                  | –               | Angular imports for the page. Standalone demos don't need them.                                                                                                 |
| `providers`               | `Component['providers']`                | –               | Providers for every component on the page.                                                                                                                      |
| `demos`                   | `Record<string, Type<unknown>>`         | –               | Demo components, keyed by class name (`*DemosPage`).                                                                                                            |
| `playgrounds`             | `Record<string, NgDocPlaygroundConfig>` | –               | Playgrounds, keyed by playground ID (`*PlaygroundsPage`).                                                                                                       |
| `disableFullscreenRoutes` | `boolean`                               | `false`         | Renders child routes in your own `router-outlet` instead of a fullscreen dialog.                                                                                |

A doc comment on the page object becomes the page description. A `@status:<color> <text>` tag in it
adds a sidebar badge.

## NgDocCategory

The default export of `ng-doc.category.ts`. See `NgDocCategory`.

| Field         | Type                 | Default         | Description                                                                                       |
| ------------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `title`       | `string`             | required        | The category title in the sidebar and in breadcrumbs.                                             |
| `category`    | `NgDocCategory`      | –               | The parent category.                                                                              |
| `order`       | `number`             | –               | The position in the sidebar, lowest first.                                                        |
| `route`       | `string`             | The folder name | The route segment. Page routes start with it.                                                     |
| `expandable`  | `boolean`            | `true`          | Lets readers collapse the category. When `false`, it is always open.                              |
| `expanded`    | `boolean`            | `false`         | Opens the category when the site loads.                                                           |
| `hidden`      | `boolean`            | `false`         | Removes the category and its pages from the sidebar.                                              |
| `onlyForTags` | `string[]`           | –               | Keeps the category, and everything in it, only in builds with one of these tags. New engine only. |
| `providers`   | `Route['providers']` | –               | Providers for every page in the category.                                                         |

## NgDocApi

The default export of `ng-doc.api.ts`. See `NgDocApi` and `*GenerateApiPagesPage`.

| Field      | Type              | Default  | Description                                                                 |
| ---------- | ----------------- | -------- | --------------------------------------------------------------------------- |
| `title`    | `string`          | required | The title of the API list page.                                             |
| `scopes`   | `NgDocApiScope[]` | required | The sources to document. Each scope is a group in the API list.             |
| `category` | `NgDocCategory`   | –        | The category that contains the API list page.                               |
| `route`    | `string`          | `'api'`  | The route of the API list page. Use different routes for several API files. |
| `keyword`  | `string`          | –        | A page keyword for the API list page, used as `*` followed by the keyword.  |
| `order`    | `number`          | –        | The position in the sidebar, lowest first.                                  |
| `hidden`   | `boolean`         | `false`  | Removes the API list page from the sidebar.                                 |

### NgDocApiScope

| Field     | Type                 | Default  | Description                                                             |
| --------- | -------------------- | -------- | ----------------------------------------------------------------------- |
| `name`    | `string`             | required | The scope name shown in the API list, usually the package name.         |
| `route`   | `string`             | required | The route segment of the scope's API pages.                             |
| `include` | `string \| string[]` | required | Glob patterns of the files to document, relative to the workspace root. |
| `exclude` | `string \| string[]` | –        | Glob patterns of the files to skip.                                     |
| `order`   | `number`             | –        | The position of the scope in the API list.                              |

Every exported class, interface, function, type alias, enum and variable in the included files gets
an API page. A declaration with an `@internal` tag is skipped.

## Playground configuration

Each value in a page's `playgrounds` is an `NgDocPlaygroundConfig`. The options of
`NgDocActions.playground` can also be set here.

| Field           | Type                                                     | Default  | Description                                                         |
| --------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `target`        | `Type<unknown>`                                          | required | The component, directive or pipe to play with.                      |
| `template`      | `string`                                                 | required | The template. `<ng-doc-selector>` stands for the target's selector. |
| `controls`      | `Record<string, string \| NgDocPlaygroundControlConfig>` | –        | Extra or replacement controls, keyed by property name.              |
| `content`       | `Record<string, NgDocPlaygroundContent>`                 | –        | Content that readers can toggle, inserted into the template by key. |
| `selectors`     | `string \| string[]`                                     | All      | The selectors to render, for targets with several selectors.        |
| `expanded`      | `boolean`                                                | `false`  | Opens the playground expanded.                                      |
| `hideSidePanel` | `boolean`                                                | `false`  | Hides the controls.                                                 |
| `inputs`        | `Record<string, unknown>`                                | –        | Input values set once when the playground renders.                  |
| `defaults`      | `Record<string, unknown>`                                | –        | Initial control values, also used by the reset button.              |
| `hiddenInputs`  | `string[]`                                               | –        | Inputs without a control.                                           |
| `data`          | `Record<string, unknown>`                                | –        | Data for the template, available as `data`.                         |

## Markdown front matter

Front matter goes at the top of a Markdown file, between `---` lines.

| Field     | Description                                                                              |
| --------- | ---------------------------------------------------------------------------------------- |
| `keyword` | The page keyword. Link to the page with `*` followed by the keyword.                     |
| `title`   | The tab label, for pages with several Markdown files. The page title is used by default. |
| `route`   | The tab route, added to the page route. Required on every tab except the first one.      |
| `icon`    | The tab icon.                                                                            |

```markdown name="nx.md"
---
title: Nx
route: nx
keyword: InstallationNxPage
---
```

{% index false %}

## Related

- `*PagesAndCategoriesPage`
- `*ConfigurationReference`
- `*SyntaxReference`

{% endindex %}
