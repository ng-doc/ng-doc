---
keyword: PageSkeletonPage
---

The page skeleton is the set of components that NgDoc renders around the content of every page:
the breadcrumbs above the title, the links to the previous and next page below the content, and the
"On this page" rail beside it. You choose these components with `providePageSkeleton`, so you can
replace any of them or leave it out.

## 🧰 Use it

Provide the default skeleton in the application configuration. `ng add` does this for you:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NG_DOC_DEFAULT_PAGE_SKELETON, providePageSkeleton } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON)],
};
```

The skeleton has three parts:

| Field         | Interface              | Default component              | Where it shows                                                              |
| ------------- | ---------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `breadcrumbs` | `NgDocPageBreadcrumbs` | `NgDocBreadcrumbComponent`     | Above the page title.                                                       |
| `navigation`  | `NgDocPageNavigation`  | `NgDocPageNavigationComponent` | Below the content of guide pages. API pages have no previous and next page. |
| `toc`         | `NgDocPageToc`         | `NgDocTocComponent`            | Beside the content. It is hidden at 1240px and below.                       |

Leave a field out to remove that part from every page. This skeleton has no breadcrumbs:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NgDocPageNavigationComponent, NgDocTocComponent, providePageSkeleton } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    providePageSkeleton({
      navigation: NgDocPageNavigationComponent,
      toc: NgDocTocComponent,
    }),
  ],
};
```

<ng-doc-blockquote type="note" label="💡 Tip">

List the components you want instead of spreading `NG_DOC_DEFAULT_PAGE_SKELETON` and overriding a
field. The default skeleton imports all three default components, so a component you replace would
stay in the bundle.

</ng-doc-blockquote>

## Write your own component

A skeleton component is a standalone Angular component that implements the interface of its part.
NgDoc creates it and sets its fields with the `setInput()` method of `ComponentRef`, so declare them
as signal inputs:

```typescript name="breadcrumbs.component.ts"
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocPageBreadcrumbs } from '@ng-doc/app';

@Component({
  selector: 'app-breadcrumbs',
  template: `
    <ol>
      @for (breadcrumb of breadcrumbs(); track $index) {
        <li>{{ '{{ breadcrumb }}' }}</li>
      }
    </ol>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbsComponent implements NgDocPageBreadcrumbs {
  readonly breadcrumbs = input.required<string[]>();
}
```

Then provide it in place of the default one:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NgDocPageNavigationComponent, NgDocTocComponent, providePageSkeleton } from '@ng-doc/app';

import { BreadcrumbsComponent } from './breadcrumbs.component';

export const appConfig: ApplicationConfig = {
  providers: [
    providePageSkeleton({
      breadcrumbs: BreadcrumbsComponent,
      navigation: NgDocPageNavigationComponent,
      toc: NgDocTocComponent,
    }),
  ],
};
```

## Inputs

Each part receives these inputs:

| Part          | Input               | Type                           | Value                                                                                                                                                                                                                                          |
| ------------- | ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breadcrumbs` | `breadcrumbs`       | `string[]`                     | The titles of the categories above the page, then the page title.                                                                                                                                                                              |
| `navigation`  | `prevPage`          | `NgDocNavigation \| undefined` | The previous page in the sidebar order, with its `title` and `route`. `undefined` on the first page.                                                                                                                                           |
| `navigation`  | `nextPage`          | `NgDocNavigation \| undefined` | The next page in the sidebar order. `undefined` on the last page.                                                                                                                                                                              |
| `toc`         | `tableOfContent`    | `NgDocTocItem[]`               | The headings of the page, in order. Each item has the heading `title`, its `level`, its `path` and `hash`, and the heading element.                                                                                                            |
| `toc`         | `editSourceFileUrl` | `string \| undefined`          | The link that edits the page source, from `repoConfig` (`*ConfigurationReference#repoconfig`). Set only if the component declares it.                                                                                                          |
| `toc`         | `details`           | `Element \| undefined`         | On API pages of the new engine, the symbol details (kind, decorators, selectors, heritage, scope) to show in the rail. Set only if the component declares it; the component inserts the element. Without it, the details stay out of the rail. |

A navigation component, for example:

```typescript name="pager.component.ts"
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocNavigation, NgDocPageNavigation } from '@ng-doc/app';

@Component({
  selector: 'app-pager',
  imports: [RouterLink],
  template: `
    @if (prevPage(); as page) {
      <a rel="prev" [routerLink]="page.route">← {{ '{{ page.title }}' }}</a>
    }
    @if (nextPage(); as page) {
      <a rel="next" [routerLink]="page.route">{{ '{{ page.title }}' }} →</a>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagerComponent implements NgDocPageNavigation {
  readonly prevPage = input<NgDocNavigation>();
  readonly nextPage = input<NgDocNavigation>();
}
```

## 🚧 Gotchas

> **Note**
> The `[` and `]` keyboard shortcuts click the links marked `rel="prev"` and `rel="next"`
> (`*SearchPage#keyboard-shortcuts`). Keep these attributes in your navigation component so the
> shortcuts still work.

> **Note**
> The `L` shortcut copies the link to the page. The default table of contents takes it over to
> confirm the copy; with your own component, the shortcut still copies the link.

{% index false %}

## Related

- `*LayoutPage`
- `*AppProvidersReference#providepageskeleton`

{% endindex %}

Next: `*ThemesAndColorsPage`
