---
keyword: CustomPageComponentsPage
---

A page processor replaces HTML elements of a page with an Angular component. NgDoc renders its own
parts of a page this way: code blocks, callouts, demos, playgrounds, tabs and images all start as
plain HTML and become components in the browser. Your own processors can add components to
Markdown, or improve elements that Markdown already produces.

## See it

This page registers two processors. One replaces images with a component that zooms on hover and
shows the image title in a tooltip:

![NgDoc logo](assets/images/brand/logo.svg 'The NgDoc logo')

The other wraps every table in a component that gives it a colored border:

| Syntax    | Description |
| --------- | ----------- |
| Header    | Title       |
| Paragraph | Text        |

## How it works

The builder renders your Markdown to HTML. When a page is shown, NgDoc looks for the elements that
each processor selects, reads inputs from them, and puts the processor's component in their place.
The processors run in order: first the main processors, usually `NG_DOC_DEFAULT_PAGE_PROCESSORS`,
then yours.

A processor is an `NgDocPageProcessor` object:

| Field            | Description                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `component`      | The component that replaces the element.                                                                    |
| `selector`       | A CSS selector for the elements to replace.                                                                 |
| `extractOptions` | Reads the component's `inputs` from the element, and optionally the `content` to project into it.           |
| `nodeToReplace`  | Optional. Returns another node to replace instead of the selected element, for example to keep the element. |

## Replace an element

First, the component. It is a standalone component with signal inputs:

```typescript name="image-viewer.component.ts" file="./demos/image-viewer.component.ts"

```

Then the processor. It selects every `img` element and reads the inputs from its attributes:

```typescript name="image.processor.ts" file="./demos/image.processor.ts"

```

`extractOptions` is typed by the component: an input value of the wrong type fails to compile. For a
signal input, pass the type that the input accepts.

## Register a processor

Register processors with `providePageProcessor`. In the `providers` of a page, they work on that
page only:

```typescript name="ng-doc.page.ts"
import { providePageProcessor } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import { imageProcessor } from './image.processor';

const MyPage: NgDocPage = {
  title: 'My page',
  mdFile: './index.md',
  providers: [providePageProcessor(imageProcessor)],
};

export default MyPage;
```

In the application configuration, they work on every page:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { providePageProcessor } from '@ng-doc/app';

import { imageProcessor } from './image.processor';

export const appConfig: ApplicationConfig = {
  providers: [providePageProcessor(imageProcessor)],
};
```

Then write the element in Markdown or HTML as usual:

```markdown name="index.md"
![NgDoc logo](assets/images/brand/logo.svg 'The NgDoc logo')
```

## Wrap an element

To keep the element and put a component around it, pass the element as the component's `content`,
and return a new anchor from `nodeToReplace`. The component projects the element with
`ng-content`:

```typescript name="custom-table.component.ts" file="./demos/custom-table.component.ts"

```

```typescript name="table.processor.ts" file="./demos/table.processor.ts"

```

## Gotchas

> **Warning**
> Processors registered in a page replace those registered in the application configuration, for
> that page. Angular doesn't merge `multi` providers of a route with those of the application, so
> repeat the application processors in the page if you need both.

> **Note**
> Your processors run after the main ones, so they see the page after NgDoc has changed it. The
> default image processor wraps each image in NgDoc's image viewer, and the example processor above
> then replaces the image inside it. To replace NgDoc's own handling of an element instead, pass
> `provideMainPageProcessor` a list without the default processor for it.

{% index false %}

## Related

- `*AppProvidersReference#page-processors`
- `*ImagesVideoAndEmbedsPage`

{% endindex %}

Next: `*DevServerAndBuildsPage`
