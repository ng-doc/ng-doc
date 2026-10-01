---
keyword: DemoPanePage
---

A demo pane shows a demo and its source side by side. The demo is in front; readers drag the handle
between the panes to reveal the code behind it. Use it when the demo should come first, and the
code is there for readers who want it.

## See it

{{ NgDocActions.demoPane("ButtonDemoComponent") }}

Drag the handle, or click it, to reveal the code. The handle also works with the keyboard: the
arrow keys move it, and Enter or Space opens or closes the code pane. With several source files,
the code pane shows them as tabs.

## Use it

Add the component to the `demos` of the page, as for a demo (`*DemosPage#use-it`), then render it
with the `demoPane` action:

```twig name="index.md"
{{ '{{ NgDocActions.demoPane("ButtonDemoComponent") }}' | safe }}
```

## Options

Pass options as the second argument of `demoPane`. They follow `NgDocDemoPaneActionOptions`:

| Option            | Type                      | Default | Description                                                             |
| ----------------- | ------------------------- | ------- | ----------------------------------------------------------------------- |
| `expanded`        | `boolean`                 | `false` | Opens the code pane from the start.                                     |
| `defaultTab`      | `string`                  | –       | The source tab to open first, such as `HTML`.                           |
| `tabs`            | `string \| string[]`      | All     | The source tabs to show, by name.                                       |
| `inputs`          | `Record<string, unknown>` | –       | Values for the inputs of the demo component.                            |
| `fullscreenRoute` | `string`                  | –       | Shows a link that opens the demo on its own route, instead of the demo. |
| `class`           | `string \| string[]`      | –       | CSS classes for the demo pane element.                                  |

This demo pane opens with its code, and shows only the template:

```twig name="index.md"
{{ '{{ NgDocActions.demoPane("ButtonDemoComponent", { expanded: true, tabs: ["HTML"] }) }}' | safe }}
```

{{ NgDocActions.demoPane("ButtonDemoComponent", { expanded: true, tabs: ["HTML"] }) }}

{% include "../../shared/demo-inputs.md" %}

```twig name="index.md"
{{ '{{ NgDocActions.demoPane("ButtonInlineDemoComponent", { inputs: { color: "info" } }) }}' | safe }}
```

{{ NgDocActions.demoPane("ButtonInlineDemoComponent", { inputs: { color: "info" } }) }}

{% include "../../shared/fullscreen-demo.md" %}

```twig name="index.md"
{{ '{{ NgDocActions.demoPane("ButtonDemoComponent", { fullscreenRoute: "button" }) }}' | safe }}
```

{{ NgDocActions.demoPane("ButtonDemoComponent", { fullscreenRoute: "button" }) }}

{% include "../../shared/disable-fullscreen-routes-demo.md" %}

## Customization

Style every demo pane with CSS variables in your global styles:

```css name="styles.css"
:root {
  --ng-doc-demo-pane-height: 320px;
  --ng-doc-pane-front-background: var(--ng-doc-background);
}
```

| Variable                          | Default                                | Description                                              |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `--ng-doc-demo-pane-height`       | The height of the content              | A fixed height for demo panes.                           |
| `--ng-doc-demo-pane-margin`       | `--ng-doc-page-block-margin`           | The space above and below a demo pane. Set it on `body`. |
| `--ng-doc-pane-border`            | `1px solid var(--ng-doc-border-color)` | The border of the demo pane and of both panes.           |
| `--ng-doc-pane-background`        | `--ng-doc-base-1`                      | The background of both panes.                            |
| `--ng-doc-pane-front-background`  | `--ng-doc-pane-background`             | The background of the demo pane.                         |
| `--ng-doc-pane-back-background`   | `--ng-doc-pane-background`             | The background of the code pane.                         |
| `--ng-doc-pane-front-border`      | `--ng-doc-pane-border`                 | The border of the demo pane.                             |
| `--ng-doc-pane-back-border`       | `--ng-doc-pane-border`                 | The border of the code pane.                             |
| `--ng-doc-pane-content-min-width` | `200px`                                | The narrowest a pane can get.                            |

To style one demo pane, give it a class with the `class` option and set the variables on that
class:

```twig name="index.md"
{{ '{{ NgDocActions.demoPane("ButtonDemoComponent", { class: "tall-pane" }) }}' | safe }}
```

```css name="styles.css"
.tall-pane {
  --ng-doc-demo-pane-height: 480px;
}
```

## Gotchas

> **Note**
> A demo pane opens on `defaultTab` or on the first tab. Unlike a demo, it ignores the `opened`
> parameter of snippets (`*SnippetsPage#opened-by-default`).

{% index false %}

## Related

- `*DemosPage`
- `*SnippetsPage`

{% endindex %}

Next: `*SnippetsPage`
