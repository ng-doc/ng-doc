---
keyword: 'GuidesDemo'
---

## Introduction

What is documentation without a demo right? Sometimes we all like to look at
the code and usage first, and only then read the documentation.

{% include "../../shared/creating-demo.md" %}

## Displaying demo

To display the created demo on the page, you should use the `demo` method from `NgDocActions`,
passing the name of your component to it as follows

```twig name="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent") }}' | safe }}
```

NgDoc will separate your component's code into multiple tabs to make it easier to view, and show it
like this

{{ NgDocActions.demo("ButtonDemoComponent", {inputs: {color: 'alert'} }) }}

## Configuration

The demo action also supports some options that can be passed as the second parameter and must
conform to the `NgDocDemoActionOptions` interface. For example, displaying a demo without a
container.

```twig name="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}' | safe }}
```

> **Note**
> You can use this option not only as a demo output, but also as an opportunity to insert any of
> your
> components into the page template so that the user can interact with them.

{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}

{% include "../../shared/demo-inputs.md" %}

```twig name="index.md"
{{'{{ NgDocActions.demo("ButtonInlineDemoComponent", {inputs: {color: "info"} }) }}' | safe }}
```

{{ NgDocActions.demo("ButtonInlineDemoComponent", {inputs: {color: "info"} }) }}

{% include "../../shared/fullscreen-demo.md" %}

```twig name="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent", {fullscreenRoute: "button"}) }}' | safe }}
```

{{ NgDocActions.demo("ButtonDemoComponent", {fullscreenRoute: "button"}) }}

{% include "../../shared/disable-fullscreen-routes-demo.md" %}

## Customization

You can customize the demo component via CSS variables.

> **Warning**
> Be careful `--ng-doc-demo-displayer-*` variables will be applied to all playgrounds as well.

```scss name="styles.scss"
:root {
  // Demo border
  --ng-doc-demo-displayer-border: 1px solid #ccc;
  // Demo border radius
  --ng-doc-demo-displayer-border-radius: 4px;
  // Demo background
  --ng-doc-demo-displayer-background: #fff;
}
```

To customize only specific demo, you can provide CSS class to the options of the `demo` method.

```twig name="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent", {class: "my-demo"}) }}' | safe }}
```

{% index false %}

## See Also

- `*EntitiesPage`
- `*GuidesDemoPane`
- `*GuidesPlayground`
- `*GuidesSnippets`
- `*IgnoringFileLines`

{% endindex %}
