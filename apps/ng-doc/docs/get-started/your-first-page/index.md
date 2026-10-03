---
keyword: YourFirstPage
---

Write a documentation page with a callout, a code block, a live demo, a playground and a link to an
API page. The tutorial takes about 10 minutes, and each step shows the result you should see. ✍️

## Before you start

You need an Angular application with NgDoc installed (`*InstallationPage`), and the development
server running with `ng serve`.

The tutorial documents a small `BadgeComponent`. Save it as `src/app/badge/badge.component.ts`:

```typescript name="badge.component.ts" file="./example/src/app/badge/badge.component.ts"

```

The commands below create the documentation in `src/docs`. By default, NgDoc finds pages anywhere
in the folder that contains your application's `main.ts`, so any folder under `src` works.

## 1. Create a category

A category groups pages in the sidebar. Create one for your components:

```bash
ng g @ng-doc/builder:category "Components" --path src/docs
```

You should see a new file, `src/docs/components/ng-doc.category.ts`:

```typescript name="ng-doc.category.ts"
import { NgDocCategory } from '@ng-doc/core';

const ComponentsCategory: NgDocCategory = {
  title: 'Components',
};

export default ComponentsCategory;
```

More about categories: `*PagesAndCategoriesPage`.

## 2. Create a page

Create a page inside the category. `--category` imports the closest category file into the page:

```bash
ng g @ng-doc/builder:page "Badge" --category --path src/docs/components
```

The command creates two files in `src/docs/components/badge`:

- `ng-doc.page.ts`, the page configuration;
- `index.md`, the page content.

You should see **Components › Badge** in the sidebar. The page is at `/components/badge` and shows
the text "It's time to write some awesome docs!".

## 3. Write the content

Replace the text in `index.md` with a description, a callout and a code block. Keep the front
matter: its `keyword` lets other pages link to this one.

````markdown name="index.md"
---
keyword: BadgePage
---

A badge shows a short status label next to other content.

> **Note**
> Keep badge labels to one or two words.

```html name="usage.html"
<app-badge label="Published" tone="success" />
```
````

You should see:

A badge shows a short status label next to other content.

> **Note**
> Keep badge labels to one or two words.

```html name="usage.html"
<app-badge label="Published" tone="success" />
```

More about Markdown: `*MarkdownAndCalloutsPage` and `*CodeBlocksPage`.

## 4. Add a demo

A demo renders a real component on the page. Create `badge-demo.component.ts` next to
`ng-doc.page.ts`, in `src/docs/components/badge`:

```typescript name="badge-demo.component.ts" file="./example/src/docs/components/badge/badge-demo.component.ts"

```

Register the demo in the page configuration:

```typescript name="ng-doc.page.ts" {3,9}
import { NgDocPage } from '@ng-doc/core';
import ComponentsCategory from '../ng-doc.category';
import { BadgeDemoComponent } from './badge-demo.component';

const BadgePage: NgDocPage = {
  title: `Badge`,
  mdFile: './index.md',
  category: ComponentsCategory,
  demos: { BadgeDemoComponent },
};

export default BadgePage;
```

Then render it at the end of `index.md`:

```twig name="index.md"
{{ '{{ NgDocActions.demo("BadgeDemoComponent") }}' | safe }}
```

You should see the demo, with its source code in tabs:

{{ NgDocActions.demo("BadgeDemoComponent") }}

More about demos: `*DemosPage`.

## 5. Add a playground

A playground lets readers change the inputs of a component. NgDoc reads the inputs of
`BadgeComponent` and creates a control for each of them.

Add the playground to the page configuration:

```typescript name="ng-doc.page.ts" {3,11-16}
import { NgDocPage } from '@ng-doc/core';
import ComponentsCategory from '../ng-doc.category';
import { BadgeComponent } from '../../../app/badge/badge.component';
import { BadgeDemoComponent } from './badge-demo.component';

const BadgePage: NgDocPage = {
  title: `Badge`,
  mdFile: './index.md',
  category: ComponentsCategory,
  demos: { BadgeDemoComponent },
  playgrounds: {
    BadgePlayground: {
      target: BadgeComponent,
      template: `<ng-doc-selector></ng-doc-selector>`,
    },
  },
};

export default BadgePage;
```

`<ng-doc-selector>` stands for the selector of the target component. Render the playground in
`index.md`:

```twig name="index.md"
{{ '{{ NgDocActions.playground("BadgePlayground") }}' | safe }}
```

You should see the playground. Change the label or the tone to update the badge:

{{ NgDocActions.playground("BadgePlayground") }}

More about playgrounds: `*PlaygroundsPage`.

## 6. Link to the API page

NgDoc can generate a page for every exported declaration in your code. Create an API configuration
file:

```bash
ng g @ng-doc/builder:api --path src/docs
```

Add a scope for your components to `src/docs/ng-doc.api.ts`. The `include` paths are relative to the
workspace root.

```typescript name="ng-doc.api.ts" {5-11}
import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'API References',
  scopes: [
    {
      name: 'My library',
      route: 'my-library',
      include: 'src/app/**/*.ts',
    },
  ],
};

export default api;
```

Now write the name of a declaration as inline code in `index.md`:

```markdown name="index.md"
See `BadgeComponent` for all inputs.
```

You should see a link to the API page of `BadgeComponent`. It works the same way as this link to an
NgDoc interface: `NgDocPage`.

More about API pages and links: `*GenerateApiPagesPage` and `*LinksAndKeywordsPage`.

## 7. Find the page

Press `/` or click the search field in the navigation bar, and type `badge`.

You should see the Badge page in the search results.

More about search: `*SearchPage`.

## 🎉 Next steps

You have a page with every main feature. From here:

- learn how NgDoc builds the site: `*HowNgDocWorksPage`;
- organize pages, tabs and categories: `*PagesAndCategoriesPage`;
- change the look: `*ThemesAndColorsPage`.

Next: `*HowNgDocWorksPage`
