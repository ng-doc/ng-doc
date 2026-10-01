---
keyword: DemosPage
---

A demo renders one of your Angular components on a page, next to its source code. Readers see the
component working and the code that builds it, and the code can't drift, because NgDoc reads it from
the component's own files.

## See it

{{ NgDocActions.demo("ButtonDemoComponent") }}

The toolbar switches between the **Preview** and the source files of the component. On the
preview, the width buttons show the demo at full width, 480 pixels or 280 pixels, and the copy
button copies the open source file, or on the preview, the file that would open first.

## Use it

1. Write a standalone component for the demo, usually next to the page.
2. Add it to the `demos` of the page:

   ```typescript name="ng-doc.page.ts"
   import { NgDocPage } from '@ng-doc/core';

   import { ButtonDemoComponent } from './button-demo/button-demo.component';

   const MyPage: NgDocPage = {
     title: 'Buttons',
     mdFile: './index.md',
     demos: { ButtonDemoComponent },
   };

   export default MyPage;
   ```

3. Render it in the Markdown with the `demo` action and the key you used in `demos`:

   ```twig name="index.md"
   {{ '{{ NgDocActions.demo("ButtonDemoComponent") }}' | safe }}
   ```

The source tabs are the component's files: its TypeScript file, and its template and styles when
they are separate files. Each tab is named after the language of its file, such as `TypeScript`,
`HTML` or `SCSS`. To show only part of a file, or to name the tabs yourself, use snippets
(`*SnippetsPage`).

The demo component can import anything your application can. If it is declared in an NgModule
instead of being standalone, add the module to the `imports` of the page.

## Options

Pass options as the second argument of `demo`. They follow `NgDocDemoActionOptions`:

```twig name="index.md"
{{ '{{ NgDocActions.demo("ButtonDemoComponent", { expanded: true, tabs: ["HTML"] }) }}' | safe }}
```

| Option            | Type                      | Default | Description                                                                                     |
| ----------------- | ------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `expanded`        | `boolean`                 | `false` | Opens the demo on a source file instead of the preview.                                         |
| `defaultTab`      | `string`                  | –       | The source file to open first: the name of a tab, such as `HTML`.                               |
| `tabs`            | `string \| string[]`      | All     | The source tabs to show, by name.                                                               |
| `inputs`          | `Record<string, unknown>` | –       | Values for the inputs of the demo component (see below).                                        |
| `container`       | `boolean`                 | `true`  | Shows the toolbar and the frame. With `false`, the demo renders on its own, without the source. |
| `fullscreenRoute` | `string`                  | –       | Shows a link that opens the demo on its own route, instead of the demo itself (see below).      |
| `class`           | `string \| string[]`      | –       | CSS classes for the demo element, for example to style one demo.                                |

With `expanded`, the demo opens on the snippet marked `opened`, then on `defaultTab`, then on the
first file.

This demo shows only the template, and opens on it:

{{ NgDocActions.demo("ButtonDemoComponent", { expanded: true, tabs: ["HTML"] }) }}

This one has no container:

```twig name="index.md"
{{ '{{ NgDocActions.demo("ButtonDemoComponent", { container: false }) }}' | safe }}
```

{{ NgDocActions.demo("ButtonDemoComponent", { container: false }) }}

{% include "../../shared/demo-inputs.md" %}

```twig name="index.md"
{{ '{{ NgDocActions.demo("ButtonInlineDemoComponent", { inputs: { color: "info" } }) }}' | safe }}
```

{{ NgDocActions.demo("ButtonInlineDemoComponent", { inputs: { color: "info" } }) }}

NgDoc sets the inputs once, when it renders the demo.

{% include "../../shared/fullscreen-demo.md" %}

```twig name="index.md"
{{ '{{ NgDocActions.demo("ButtonDemoComponent", { fullscreenRoute: "button" }) }}' | safe }}
```

{{ NgDocActions.demo("ButtonDemoComponent", { fullscreenRoute: "button" }) }}

The link opens the page with the route in a new tab, and NgDoc shows the demo in a fullscreen
dialog over the page.

{% include "../../shared/disable-fullscreen-routes-demo.md" %}

## Customization

Style every demo with CSS variables in your global styles:

```css name="styles.css"
:root {
  --ng-doc-demo-displayer-border: 1px solid var(--ng-doc-border-color);
  --ng-doc-demo-displayer-border-radius: 12px;
  --ng-doc-demo-displayer-background: var(--ng-doc-base-1);
  --ng-doc-demo-toolbar-background: var(--ng-doc-base-2);
}
```

| Variable                                | Default                                | Description                                           |
| --------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `--ng-doc-demo-displayer-border`        | `1px solid var(--ng-doc-border-color)` | The border of the frame.                              |
| `--ng-doc-demo-displayer-border-radius` | `--ng-doc-radius-lg`                   | The corner radius of the frame.                       |
| `--ng-doc-demo-displayer-background`    | `--ng-doc-background`                  | The background behind the demo.                       |
| `--ng-doc-demo-toolbar-background`      | `--ng-doc-base-1`                      | The background of the toolbar.                        |
| `--ng-doc-demo-margin`                  | `--ng-doc-page-block-margin`           | The space above and below the demo. Set it on `body`. |

To style one demo, give it a class with the `class` option and set the variables on that class:

```twig name="index.md"
{{ '{{ NgDocActions.demo("ButtonDemoComponent", { class: "wide-demo" }) }}' | safe }}
```

```css name="styles.css"
.wide-demo {
  --ng-doc-demo-displayer-background: var(--ng-doc-base-2);
}
```

## Gotchas

> **Warning**
> The `--ng-doc-demo-displayer-*` variables style playgrounds and demo panes too.

> **Note**
> The width buttons resize the demo's frame, not the window, so media queries in the demo don't
> respond to them.

{% index false %}

## Related

- `*DemoPanePage`
- `*SnippetsPage`
- `*PlaygroundsPage`

{% endindex %}

Next: `*DemoPanePage`
