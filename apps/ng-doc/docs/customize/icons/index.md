---
keyword: IconsPage
---

NgDoc shows icons next to the names of code blocks, code groups, demo files, snippets and page tabs.
These icons are your own SVG files: add them to your application, then refer to them by file name.

## See it

```typescript name="app.ts" icon="angular"
@Component({ selector: 'app-root', template: '' })
export class App {}
```

This block names the `angular` icon, which this site keeps in `assets/icons/angular.svg`.

## Add an icon

1. Put an SVG file in the folder that your application serves at `assets/icons`. In an application
   that copies its `public` folder into the build, that is `public/assets/icons`.
2. Refer to the icon by the file name without `.svg`: `my-icon.svg` is `my-icon`.

````markdown name="index.md"
```bash name="Terminal" icon="my-icon"
npm install my-library
```
````

The icon is loaded when a page first shows it, and inlined into the page. Every icon can be used
wherever NgDoc accepts one:

| Where           | How                                                                                  |
| --------------- | ------------------------------------------------------------------------------------ |
| Code blocks     | The `icon` attribute (`*CodeBlocksPage#icons`).                                      |
| Snippets        | The `icon` parameter of a snippet comment (`*SnippetsPage#icon`).                    |
| Page tabs       | The `icon` field in the front matter of a tab (`*PagesAndCategoriesPage#page-tabs`). |
| Your components | `<ng-doc-icon customIcon="my-icon" />`, from `@ng-doc/ui-kit`.                       |

To show an icon in the same color as the text around it, use `currentColor` for the fill or the
stroke in the SVG file. NgDoc renders icons at 16 by 16 pixels, or 24 by 24 with `size="24"`, so
draw them with a matching `viewBox`.

## Change the folder

Set `customIconsPath` in `provideNgDocApp`. The UI kit options go together, so set `assetsPath` to
its default too:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideNgDocApp } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgDocApp({
      uiKit: {
        assetsPath: 'assets/ng-doc/ui-kit',
        customIconsPath: 'assets/my-icons',
      },
    }),
  ],
};
```

The path is a URL relative to the `<base href>` of the application, not a folder of your
workspace.

## Built-in icons

NgDoc's own interface uses a small set of [Feather](https://feathericons.com) icons from
`@ng-doc/ui-kit`, served at `assets/ng-doc/ui-kit`. You can show them with the `icon` input instead
of `customIcon`, including in Markdown:

```html name="index.md"
<ng-doc-icon icon="info" size="24"></ng-doc-icon>
```

<ng-doc-icon icon="info" size="24"></ng-doc-icon>

The set contains only the icons NgDoc needs, so it is not a general icon library. Use custom icons
for your own content.

## Gotchas

> **Warning**
> An icon that fails to load, or a response that isn't SVG, such as a development server answering a
> missing file with `index.html`, shows nothing and logs an error in the browser console. Check the
> file name and the folder first.

{% index false %}

## Related

- `*CodeBlocksPage`
- `*SnippetsPage`
- `*AppProvidersReference#providengdocapp`

{% endindex %}

Next: `*SearchPage`
