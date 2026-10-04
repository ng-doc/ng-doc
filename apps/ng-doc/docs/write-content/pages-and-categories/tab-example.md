---
title: Tab example
route: tab-example
keyword: PageTabsExample
---

This is the second tab of **Pages and categories**. It comes from `tab-example.md`, the second file
in the page's `mdFile`:

```typescript name="ng-doc.page.ts" file="./ng-doc.page.ts"

```

Its front matter sets the tab label, the route and a keyword:

```markdown name="tab-example.md"
---
title: Tab example
route: tab-example
keyword: PageTabsExample
---
```

## What a tab has of its own

- **URL:** the route is added to the page route, so this tab is
  `/docs/write-content/pages-and-categories/tab-example`. The first tab keeps the page URL.
- **Table of contents:** the headings of this file, such as this one, are the table of contents
  while the tab is open.
- **Anchors:** a link to a heading of a tab opens that tab, for example
  `*PageTabsExample#what-a-tab-has-of-its-own`.
- **Search:** the tab is indexed as its own result, with the page title and the tab label.

Back to the guide: `*PagesAndCategoriesPage#page-tabs`.
