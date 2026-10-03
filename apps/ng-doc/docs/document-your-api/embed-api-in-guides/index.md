---
keyword: EmbedApiInGuidesPage
---

A guide often needs part of the API next to its text: the inputs of the component it describes, or
the deprecation note of a function. Template functions render them from the code, so the guide
doesn't repeat what the code already says, and it updates when the code changes.

## 👀 See it

The details, the members and the description of `NgDocTagComponent`, rendered on this page from
its source:

{{ NgDocApi.details("libs/ui-kit/components/tag/tag.component.ts#NgDocTagComponent") }}

{{ NgDocApi.api("libs/ui-kit/components/tag/tag.component.ts#NgDocTagComponent") }}

{{ JSDoc.description("libs/ui-kit/components/tag/tag.component.ts#NgDocTagComponent") }}

## 🧰 Use it

Call a function in the Markdown of the page, with the path of the declaration:

```twig name="index.md"
{{ '{{ NgDocApi.api("libs/ui-kit/components/tag/tag.component.ts#NgDocTagComponent") }}' | safe }}
```

The path is the file, relative to the workspace root, then `#` and the exported name. The
declaration doesn't have to be in an API scope (`*GenerateApiPagesPage`). NgDoc reads the file when
it builds the page, and builds the page again when the file changes.

## API tables

`NgDocApi.api` renders the members of a declaration as tables: a table for each group, such as the
constructor, the properties and the methods of a class, under a heading with the group's name. The
headings join the table of contents of the page. The description, the notes, the examples and the
usage notes of the declaration are left out, so you can write your own text around the tables.

```twig name="index.md"
{{ '{{ NgDocApi.api("libs/my-library/src/button.component.ts#ButtonComponent") }}' | safe }}
```

The names in the tables link to the API pages, when the declarations have one.

## Details

`NgDocApi.details` renders the details of a declaration as a small table: its decorators, generic
types and selectors, and what it extends and implements. A declaration without any of them renders
nothing.

```twig name="index.md"
{{ '{{ NgDocApi.details("libs/my-library/src/button.component.ts#ButtonComponent") }}' | safe }}
```

## Doc comments

The `JSDoc` functions read the doc comment of a declaration (`*WriteDocCommentsPage`). The tag name
is written without the `@`.

| Function                      | Returns                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `JSDoc.description(path)`     | The description, as HTML.                                              |
| `JSDoc.tag(path, tagName)`    | The text of the first tag with that name, as HTML, or an empty string. |
| `JSDoc.tags(path, tagName)`   | The texts of every tag with that name, as a list.                      |
| `JSDoc.hasTag(path, tagName)` | `true` if the comment has a tag with that name.                        |

They return values, so you can combine them with Nunjucks tags. For example, show a warning only
while a declaration is deprecated:

```twig name="index.md"
{{ '{% if JSDoc.hasTag("libs/my-library/src/format.ts#format", "deprecated") %}' | safe }}
> **Warning**
> {{ '{{ JSDoc.tag("libs/my-library/src/format.ts#format", "deprecated") }}' | safe }}
{{ '{% endif %}' | safe }}
```

Or list the `@see` tags of a declaration:

```twig name="index.md"
{{ '{% for see in JSDoc.tags("libs/my-library/src/format.ts#format", "see") %}' | safe }}
- {{ '{{ see }}' | safe }}
{{ '{% endfor %}' | safe }}
```

## 🚧 Gotchas

> **Warning**
> A path to a file or a name that doesn't exist fails the build. Paths are relative to the workspace
> root, not to the page.

> **Note**
> The embedded tables have a section for each group of members, as in the API pages of the legacy
> builders. The members table with tabs and a filter is only on the API pages themselves.

{% index false %}

## Related

- `*GenerateApiPagesPage`
- `*WriteDocCommentsPage`
- `*SyntaxReference#template-actions`

{% endindex %}

Next: `*LinkToExternalApisPage`
