# {{ NgDocPage.title }}

What is documentation without a demo right? Sometimes we all like to look at
the code and usage first, and only then read the documentation.

{% include "../../shared/creating-demo.md" %}

## Displaying demo

To display the created demo on the page, you should use the `demo` method from `NgDocActions`,
passing the name of your component to it as follows

```twig fileName="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent") }}' | safe }}
```

NgDoc will separate your component's code into multiple tabs to make it easier to view, and show it
like this

{{ NgDocActions.demo("ButtonDemoComponent") }}

## Configuration

The demo action also supports some options that can be passed as the second parameter and must
conform to the `NgDocDemoActionOptions` interface. For example, displaying a demo without a
container.

```twig fileName="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}' | safe }}
```

> **Note**
> You can use this option not only as a demo output, but also as an opportunity to insert any of
> your
> components into the page template so that the user can interact with them.

{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}

## Customization

You can customize the demo component via CSS variables.

> **Warning**
> Be careful `--ng-doc-demo-displayer-*` variables will be applied to all playgrounds as well.

```scss fileName="styles.scss"
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

```twig fileName="index.md"
{{'{{ NgDocActions.demo("ButtonDemoComponent", {class: "my-demo"}) }}' | safe }}
```

{% index false %}

## See Also

- `*EntitiesPage`
- `*GuidesDemoPane`
- `*GuidesPlayground`
- `*GuidesSnippets`

{% endindex %}
