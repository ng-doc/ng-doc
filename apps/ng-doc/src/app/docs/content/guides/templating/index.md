# {{ NgDocPage.title }}

Templates of your pages fully support `markdown` format and even more, you can reuse templates,
divide them into small ones, import, inherit and much more, below we will talk about what templates
can do.

## Nunjucks

All guides you create are handled by `nunjucks`, `nunjucks` is a powerful templating language
that allows you to create more dynamic templates.

This means that you can use any of the functions provided by `nunjucks` inside your templates!
We'll give some examples of `nunjucks` usage below, and to learn more, go to its documentation.

> **Note**
> We use a relative loader, which means that all paths you specify for `nunjucks` functions must be
> relative to your template

### Including template

To follow the DRY principle even in your templates, you can include one template in another, for
example, to add the `dry-template.md` template to your current page template, you can write the
following

```twig fileName="index.md"
{{ '{% include "../shared/dry-template.md" %}' | safe }}
```

This will force `nunjucks` to include the `dry-template.md` template in your current page, and NgDoc
will start watching for changes to this template so that if it changes, NgDoc will re-render all
templates that depend on it

### Macros

Another powerful feature of `nunjucks` is macros, macros it's a function that you can call with
parameters to render a specific part of the page.

For example, let's say you have macros in your shared folder, that looks like this:

```twig fileName="span-macro.md"
{{ '{% macro spanText(text) %}' | safe }}
	{{ '<span>{{text}}</span>' | safe }}
{{ '{% endmacro %}' | safe }}
```

This is a macro that just wraps the text in a `span` tag, but now you can use it in other
templates, for this you need to import it, and after that it will become available on your page.

```twig fileName="index.md"
{{ '{% import "../shared/span-macro.md" as myMacro %}' | safe }}

{{ '{{ myMacro.spanText("Text in the span!") }}' | safe }}
```

## Variables

Some variables are also available in your template, such as `NgDocPage`and `NgDocActions`.

The `NgDocPage` variable contains information about the current page, which you can use to, for
example, render its title. You may have noticed that NgDoc creates similar dynamic titles when you
generate pages via schematics.

So, for example to render title, you can do this

```twig fileName="index.md"
{{ '{{ NgDocPage.title }}' | safe }}
```

The `NgDocActions` provides some functions that you can call to render demo on the page,
for example, to render demo you can call `demo` method with the name of you demo component.
You can read more about the demo in the `*ContentGuidesDemo`.

```twig fileName="index.md"
{{ '{{ NgDocActions.demo("MyDemoComponent") }}' | safe }}
```

## Extended markdown

Apart from the basic functions of `markdown`, we support some advanced functions, for some default
markdown blocks

### Code block

Code blocks support some additional features, for example, you can specify `fileName` attribute
to render the code block with a file name

````markdown fileName="index.md"
```typescript fileName="my-file.ts"
const myVar = 'Hello world';
```
````

```typescript fileName="my-file.ts"
const myVar = 'Hello world';
```

You can also load the code from a file, for this you need to specify the `file` attribute,
and the path to the file **relative** to your template

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts"

```
````

```typescript file="./ng-doc.page.ts"

```

To load specific lines from the file, you can provide them at the end of the `file` attribute,
for example, to load lines from 5 to 11, you can write the following

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts#"L5-L11

```
````

```typescript file="./ng-doc.page.ts"#L5-L11

```

To load one line, you can write this

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts#"L13

```
````

```typescript file="./ng-doc.page.ts"#L13

```

And to load from a specific line to the end of the file, you can write the following

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts#"L5-

```
````

```typescript file="./ng-doc.page.ts"#L5-

```

### Note

To create a note-style `blockquote` you can write the following

```markdown fileName="index.md"
> **Note**
> This is note blockquote
```

> **Note**
> This is note blockquote

### Warning

Or if you want to create a warning-style `blockquote` you can write the following

```markdown fileName="index.md"
> **Warning**
> This is warning blockquote
```

> **Warning**
> This is warning blockquote

{% index false %}

## See Also

- `*ContentGuidesDemo`
- `*ContentKeywords`

{% endindex %}
