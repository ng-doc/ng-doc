---
keyword: TemplatesPage
---

Every Markdown file is also a `nunjucks` template. Use it to reuse content across pages, render
values from the page configuration, and call NgDoc actions such as demos and API tables.

## 👀 See it

This page reads its own configuration. Its title is **{{ NgDocPage.title }}**, and it renders this
list from the page's `data` field:

<ul>{% for step in NgDocPage.data.steps %}<li>{{ step }}</li>{% endfor %}</ul>

And this callout is included from another file:

{% include "./partials/support.md" %}

## 🧰 Use it

Nunjucks tags go straight into the Markdown. The example above comes from this source:

```twig name="index.md"
{{ "Its title is **{{ NgDocPage.title }}**." | safe }}

{{ "<ul>{% for step in NgDocPage.data.steps %}<li>{{ step }}</li>{% endfor %}</ul>" | safe }}

{{ '{% include "./partials/support.md" %}' | safe }}
```

The `data` field is set in the page configuration:

```typescript name="ng-doc.page.ts" file="./ng-doc.page.ts"

```

## Template variables

| Variable       | What it gives you                                                                       |
| -------------- | --------------------------------------------------------------------------------------- |
| `NgDocPage`    | The page configuration: `NgDocPage.title`, `NgDocPage.data` and the other fields.       |
| `NgDocActions` | `demo`, `demoPane` and `playground`, which render demos and playgrounds.                |
| `NgDocApi`     | `api` and `details`, which render API tables for a declaration.                         |
| `JSDoc`        | `description`, `tag`, `tags` and `hasTag`, which read the doc comment of a declaration. |

`*DemosPage`, `*PlaygroundsPage` and `*EmbedApiInGuidesPage` show these actions in use.
`*SyntaxReference` lists their signatures.

## Includes

`include` inserts another file into the page. Use it for text that several pages share. The path is
relative to the current Markdown file.

```twig name="index.md"
{{ '{% include "../shared/support.md" %}' | safe }}
```

When the included file changes, NgDoc rebuilds every page that includes it.

## Macros

A macro is a reusable piece of template with parameters. Define macros in a shared file:

```twig name="macros.md"
{{ '{% macro kbd(key) %}<kbd>{{ key }}</kbd>{% endmacro %}' | safe }}
```

Import the file, then call the macro:

```twig name="index.md"
{{ '{% import "../shared/macros.md" as ui %}' | safe }}

{{ "Press {{ ui.kbd('/') }} to search." | safe }}
```

## Exclude content from search

Wrap content in `index false` to keep it out of the search index. The Related links at the end of
each page on this site use it:

```twig name="index.md"
{{ '{% index false %}' | safe }}

## Related

- A link that search should skip.

{{ '{% endindex %}' | safe }}
```

Code blocks are never indexed, so you don't need to wrap them.

## Show template syntax as text

NgDoc renders every `{{ "{{ }}" }}` and `{{ "{% %}" }}` in the file, including inside code blocks.
To show them as text, output them as a string with the `safe` filter:

```twig name="index.md"
{{ "{{ '{{ NgDocPage.title }}' | safe }}" | safe }}
```

## 🚧 Gotchas

> **Warning**
> Paths in `include` and `import` are relative to the Markdown file, not to the documentation root.
> Use only the built-in Nunjucks filters: the new engine adds no filters of its own. The legacy
> builders expose some internal filters, but don't rely on them, because the new engine doesn't have
> them.

{% index false %}

## Related

- `*PagesAndCategoriesPage`
- `*EmbedApiInGuidesPage`
- `*SyntaxReference`

{% endindex %}

Next: `*DemosPage`
