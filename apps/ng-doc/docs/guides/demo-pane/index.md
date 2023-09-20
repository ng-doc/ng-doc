# {{ NgDocPage.title }}

Demo Pane is another way to display a demo, which separates code and demo into separate panes.
You can use it to focus your users on the code or demo first.

{% include "../../shared/creating-demo.md" %}

## Displaying demo

To display the created demo on the page, you should use the `demoPane` method from `NgDocActions`,
passing the name of your component to it as follows

```twig name="index.md"
{{'{{ NgDocActions.demoPane("ButtonDemoComponent") }}' | safe }}
```

NgDoc will create a demo panes with your component's code and demo, and show it like this

{{ NgDocActions.demoPane("ButtonDemoComponent") }}

{% include "../../shared/fullscreen-demo.md" %}

```twig name="index.md"
{{'{{ NgDocActions.demoPane("ButtonDemoComponent", {fullscreenRoute: "button"}) }}' | safe }}
```

{{ NgDocActions.demoPane("ButtonDemoComponent", {fullscreenRoute: "button"}) }}

## Configuration

The demo action also supports some options that can be passed as the second parameter and must
conform to the `NgDocDemoPaneActionOptions` interface. For example, displaying a code pane by
default and only html tab.

```twig name="index.md"
{{'{{ NgDocActions.demoPane("ButtonDemoComponent", {expanded: true, tabs: ["HTML"]}) }}' | safe }}
```

{{ NgDocActions.demoPane("ButtonDemoComponent", {expanded: true, tabs: ["HTML"]}) }}

## Customization

You can also customize the styles of the demo pane. To do this, need to provide following CSS
variables
from your `styles.scss` file.

```scss name="styles.scss"
:root {
  // Fixed height for all demo panes
  --ng-doc-demo-pain-height: 300px;

  // Background color for front and back panes
  --ng-doc-pane-background: #fff;
  // Border for front and back panes
  --ng-doc-pane-border: 1px solid #e5e5e5;

  // Background color for front pane
  --ng-doc-pane-front-background: #fff;
  // Border for front pane
  --ng-doc-pane-front-border: 1px solid #e5e5e5;

  // Background color for back pane
  --ng-doc-pane-back-background: #fff;
  // Border for back pane
  --ng-doc-pane-back-border: 1px solid #e5e5e5;
}
```

To customize only specific demo pane, you can provide CSS class to the options of the `demoPane`
method.

```twig name="index.md"
{{'{{ NgDocActions.demoPane("ButtonDemoComponent", {class: "my-demo-pane"}) }}' | safe }}
```

{% index false %}

## See Also

- `*EntitiesPage`
- `*GuidesDemoPane`
- `*GuidesPlayground`
- `*GuidesSnippets`
- `*IgnoringFileLines`

{% endindex %}
