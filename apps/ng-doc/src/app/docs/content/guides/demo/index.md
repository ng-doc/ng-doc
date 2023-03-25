# {{ NgDocPage.title }}

What is documentation without a demo right? Sometimes we all like to look at
the code and usage first, and only then read the documentation.

{% include "../../../shared/creating-demo.md" %}

## Displaying Demo

To display the created demo on the page, you should use the `demo` method from `NgDocActions`,
passing the name of your component to it as follows

```twig
{{'{{ NgDocActions.demo("ButtonDemoComponent") }}' | safe }}
```

NgDoc will separate your component's code into multiple tabs to make it easier to view, and show it
like this

{{ NgDocActions.demo("ButtonDemoComponent") }}

The demo action also supports some options that can be passed as the second parameter and must
conform to the `NgDocDemoActionOptions` interface. For example, displaying a demo without a
container.

> **Note**
> You can use this option not only as a demo output, but also as an opportunity to insert any of
> your
> components into the page template so that the user can interact with them.

```twig
{{'{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}' | safe }}
```

{{ NgDocActions.demo("ButtonDemoComponent", {container: false}) }}

## Snippets

If you prefer to write template and style code in one `typescript` file, or you just don't want to
create multiple files for one demo, or you want to help users to focus on more important lines of
code,
then you should try to use snippets.

> **Note**
> Snippets also work for components with multiple files

Snippets look like comments, we have 3 different types of snippets that you can use

| Language   | Start                                   | End                                   |
| ---------- | --------------------------------------- | ------------------------------------- |
| TypeScript | `/* NgDocCodeSnippetStart(Title) */`    | `/* NgDocCodeSnippetEnd(Title) */`    |
| HTML       | `<!-- NgDocHTMLSnippetStart(Title) -->` | `<!-- NgDocHTMLSnippetEnd(Title) -->` |
| Styles     | `/* NgDocStyleSnippetStart(Title) */`   | `/* NgDocStyleSnippetStart(Title) */` |

And let's say if you have a component that contains snippets and looks like this

```typescript
{% include "./demos/button-inline-demo/button-inline-demo.component.ts" %}
```

NgDoc will render its code like below

{{ NgDocActions.demo("ButtonInlineDemoComponent") }}

## See Also

- `*EntitiesPage`
- `*EntitiesDependencies`
