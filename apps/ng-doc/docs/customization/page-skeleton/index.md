# {{ NgDocPage.title }}

Page skeleton is a list of components that are used to render the page, e.g.
breadcrumbs, page navigation at the bottom, table of contents, etc.

The default page skeleton is defined in the `main.ts` file of the application:

```ts name="main.ts" {6}
import { bootstrapApplication } from '@angular/platform-browser';
import { NG_DOC_DEFAULT_PAGE_SKELETON, providePageSkeleton } from '@ng-doc/app';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON)],
}).catch((err: unknown) => console.error(err));
```

## Customizing the page skeleton

You can create your own components and provide them as a page skeleton. `providePageSkeleton`
function accepts `NgDocPageSkeleton` interface as an argument, each component should implement
specific interface. For example, the following component implements `NgDocPageBreadcrumbs`
interface:

```ts name="breadcrumb.component.ts" group="breadcrumbs"
import { Component, Input, NgFor } from '@angular/core';
import { NgDocPageBreadcrumbs } from '@ng-doc/app';

@Component({
  selector: 'my-breadcrumbs',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  imports: [NgFor],
  standalone: true,
})
export class BreadcrumbComponent implements NgDocPageBreadcrumbs {
  @Input({ required: true })
  breadcrumbs: string[] = [];
}
```

```html name="breadcrumb.component.html" group="breadcrumbs"
<ul>
  <li *ngFor="let breadcrumb of breadcrumbs">{{ '{{ breadcrumb }}' | safe }}</li>
</ul>
```

When the component is ready, you can provide it as a part of the page skeleton
using `providePageSkeleton` function:

> **Warning**
> We recommend to not override
> the default page skeleton `NG_DOC_DEFAULT_PAGE_SKELETON`, and provide default components manually,
> because if you override the default page skeleton, unused components (like
> `NgDocBreadcrumbComponent` in this example) still will be included in the bundle.

```ts name="main.ts" {8}
import { bootstrapApplication } from '@angular/platform-browser';
import { NgDocPageNavigationComponent, NgDocTocComponent, providePageSkeleton } from '@ng-doc/app';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    providePageSkeleton({
      breadcrumbs: BreadcrumbComponent,
      navigation: NgDocPageNavigationComponent,
      toc: NgDocTocComponent,
    }),
  ],
}).catch((err: unknown) => console.error(err));
```
