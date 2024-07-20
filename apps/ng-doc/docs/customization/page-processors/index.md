---
keyword: 'PageProcessors'
---

Page Processor is a really powerful feature of NgDoc. It allows you to replace HTML elements
with Angular components. This is how NgDoc renders different components inside your documentation
like demos, playgrounds, icons, etc. Using this API you can create your own components that will
make your documentation even more awesome 🎉.

## How it works

When NgDoc builder renders your markdown templates to HTML, it leaves special markers in the
output HTML. These markers are then replaced by Angular components via Page Processors on the
client side. But you can create your own markers by using Markdown or HTML syntax inside your
markdown templates, or just use existing HTML elements that you want to improve.

## Creating a Page Processor

Page Processor is a simple object that contains CSS selector, component class and function that
extracts data from the HTML element and converts it to the component input.

Let's create a simple Page Processor that will replace all `<img>` elements
with `ImageViewerComponent`,
first we need to create the `ImageViewerComponent`:

```typescript name="image-viewer.component.ts" file="./demos/image-viewer.component.ts"

```

As you can see, it's a simple component that takes `src`, `alt` and `title` as an inputs, renders
the image and adds a simple zoom-in animation on hover with a tooltip that shows the image title.

Now we need to create a Page Processor that will replace all `<img>` elements with our component:

```typescript name="image.processor.ts" file="./demos/image.processor.ts"

```

Inside the `extractOptions` method we extract the `src`, `alt` and `title` attributes from
the `<img>` element
and define them as inputs for our component.

Now we need to register our Page Processor, you can do it in the `ng-doc.page.ts` file, if you want
to enable it only for one page, or inside your `main.ts` if you want to enable it for all
pages:

> **Warning**
> Be careful when you register your Page Processors, `providePageProcessor` function
> uses `multi: true`,
> so if you register your Page Processor in the `ng-doc.page.ts` file and in the `main.ts` file,
> all processors from the `main.ts` file will be ignored.

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';
import { providePageProcessor } from '@ng-doc/app';
import { imageProcessor } from './image.processor';

const MyPage: NgDocPage = {
  title: `MyPage`,
  mdFile: './index.md',
  providers: [providePageProcessor(imageProcessor)],
};

export default MyPage;
```

After that if you use `<img>` elements using HTML or Markdown syntax, they will be replaced with the
`ImageViewerComponent`:

```markdown name="index.md"
![alt text](assets/images/ng-doc.svg 'Image title')
```

![alt text](assets/images/ng-doc.svg 'Image title')

## Wrapping HTML elements

Sometimes you want to wrap HTML elements with your component, for example, you want to wrap all
`<table>` elements with your custom component that will add some styles to the table.
You can do it by playing with `nodeToReplace` function and `content` property of
the `PageProcessor`, but first let's create a `CustomTableComponent`:

```typescript name="custom-table.component.ts" file="./demos/custom-table.component.ts"

```

Now we need to create a Page Processor that will wrap all `<table>` elements with our component:

```typescript name="table.processor.ts" file="./demos/table.processor.ts"

```

After that when you register your processor all `<table>` elements will be wrapped with
our `CustomTableComponent`:

```markdown name="index.md"
| Syntax    | Description |
| --------- | ----------- |
| Header    | Title       |
| Paragraph | Text        |
```

| Syntax    | Description |
| --------- | ----------- |
| Header    | Title       |
| Paragraph | Text        |
