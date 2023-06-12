# {{ NgDocPage.title }}

Snippets are a way to display a part of your code in the demos, and they are very useful
when you want to show a specific part of your code.

## Available Snippets

There are 3 types of snippets that you can use

- `TypeScript` - To display a part of your `typescript` code
  - `/* NgDocCodeSnippetStart(Title) */` - Start of the snippet
  - `/* NgDocCodeSnippetEnd(Title) */` - End of the snippet
- `HTML` - To display a part of your `html` code
  - `<!-- NgDocHTMLSnippetStart(Title) -->` - Start of the snippet
  - `<!-- NgDocHTMLSnippetEnd(Title) -->` - End of the snippet
- `Styles` - To display a part of your `styles` code
  - `/* NgDocStyleSnippetStart(Title) */` - Start of the snippet
  - `/* NgDocStyleSnippetEnd(Title) */` - End of the snippet

## Usage

Snippets look like comments, and you can use them in any of your demos, and they will be
displayed in the demo's code tab.

> **Note**
> Snippets also work for components with multiple files

So, let's say you have a component with the following code

```typescript file="./demos/button-inline-demo.component.ts" fileName="button-inline-demo.component.ts" {10,12,17,20,22,27}

```

NgDoc will render its code like below

{{ NgDocActions.demo("ButtonInlineDemoComponent", {expanded: true}) }}

{% index false %}

## See Also

- `*GuidesDemo`
- `*GuidesDemoPane`

{% endindex %}
