---
keyword: SyntaxReference
---

A cheat sheet of the syntax that NgDoc adds to Markdown, templates, source files and doc comments.

## Code block attributes

Attributes follow the language in the opening fence of a code block, separated by spaces. See
`*CodeBlocksPage`.

| Attribute         | Form              | Effect                                                     |
| ----------------- | ----------------- | ---------------------------------------------------------- |
| `name`            | `name="app.ts"`   | Shows a file name. In a code group, it is the tab label.   |
| `group`           | `group="install"` | Joins every block with the same group into tabs.           |
| `active`          | `active`          | Opens this block first in its group.                       |
| `icon`            | `icon="angular"`  | Shows an icon next to the name.                            |
| Highlighted lines | `{1,3-5}`         | Highlights lines. Ranges are inclusive.                    |
| `file`            | `file="./app.ts"` | Loads the code from a file, relative to the Markdown file. |

`fileName="…"` is another spelling of `name`. `lineNumbers` is accepted but has no effect. Any other
attribute fails the build.

The language is optional and defaults to TypeScript. It is any Shiki language id or alias, such as
`c++`, `c#` or `objective-c`; a language Shiki doesn't know is shown as plain text. A block with the
`mermaid` language renders a diagram (`*DiagramsPage`).

### Line ranges for `file`

Write the range right after the closing quote, with no space.

| Suffix    | Loads                          |
| --------- | ------------------------------ |
| `#L5-L10` | Lines 5 to 10.                 |
| `#L12`    | Line 12.                       |
| `#L4-`    | Line 4 to the end of the file. |

Any other suffix names a snippet of the file: `file="./app.ts"#example` loads the code between two
`// snippet#example` comments (`*CodeBlocksPage#snippets-from-a-file`). Only the new engine reads
snippet ids.

## Callouts

A blockquote whose first paragraph starts with a bold kind. See `*MarkdownAndCalloutsPage`.

```markdown name="index.md"
> **Note**
> The text of the callout.
```

| Kind         | Renders as              |
| ------------ | ----------------------- |
| `Note`       | An information callout. |
| `Warning`    | A warning callout.      |
| `Alert`      | An alert callout.       |
| `Success`    | A success callout.      |
| No bold kind | A plain blockquote.     |

## Hiding lines

A comment with `ng-doc-ignore-line` removes itself and the next line from code loaded with `file`,
from demos and from snippets. Add a number to remove more lines after the comment.

| Comment                       | Removes                                |
| ----------------------------- | -------------------------------------- |
| `// ng-doc-ignore-line`       | The comment line and the next line.    |
| `// ng-doc-ignore-line 3`     | The comment line and the next 3 lines. |
| `/* ng-doc-ignore-line */`    | The same, in styles.                   |
| `<!-- ng-doc-ignore-line -->` | The same, in templates.                |

## Snippets

Snippet comments in demo source files mark the code that a demo shows. See `*SnippetsPage`.

| Comment                             | Effect                                                      |
| ----------------------------------- | ----------------------------------------------------------- |
| `// snippet`                        | Starts or ends a snippet.                                   |
| `// snippet "Title"`                | Starts a snippet with a title.                              |
| `// snippet icon="angular"`         | Starts a snippet with an icon.                              |
| `// snippet opened`                 | Opens this snippet first.                                   |
| `// snippet#id`                     | Starts or ends the snippet `id`, which can contain others.  |
| `// snippet:css`                    | Sets the language. Write it after the ID: `snippet#id:css`. |
| `// snippet-from-file="./other.ts"` | Shows another file, relative to the demo file.              |

Snippets work in `//`, `/* */` and `<!-- -->` comments. The language defaults to HTML for
`<!-- -->` comments and to TypeScript otherwise. Prettier formats a snippet only when its language
is set to `ts`, `typescript`, `js`, `javascript`, `html`, `css`, `scss`, `less` or `sass`.

## Template tags

Markdown files are `nunjucks` templates. See `*TemplatesPage`.

| Tag                                                    | Effect                                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `{{ '{% include "./file.md" %}' }}`                    | Inserts another file, relative to the current file.     |
| `{{ '{% import "./macros.md" as m %}' }}`              | Imports the macros of another file.                     |
| `{{ "{% index false %}" }}` … `{{ "{% endindex %}" }}` | Keeps the content out of the search index.              |
| `{{ "{{ NgDocPage.title }}" }}`                        | Outputs a value. `NgDocPage` is the page configuration. |
| `{{ "{% raw %}" }}` … `{{ "{% endraw %}" }}`           | Outputs the content as written, without rendering it.   |

## Template actions

| Call                                              | Renders                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `NgDocActions.demo(className, options?)`          | A demo. Options: `NgDocDemoActionOptions` (`*DemosPage`).                          |
| `NgDocActions.demoPane(className, options?)`      | A demo pane. Options: `NgDocDemoPaneActionOptions` (`*DemoPanePage`).              |
| `NgDocActions.playground(playgroundId, options?)` | A playground. Options: `NgDocPlaygroundOptions` (`*PlaygroundsPage`).              |
| `NgDocApi.api(path)`                              | The API tables of a declaration (`*EmbedApiInGuidesPage`).                         |
| `NgDocApi.details(path)`                          | The details of a declaration: type parameters, decorators, selectors and heritage. |
| `JSDoc.description(path)`                         | The description from a declaration's doc comment.                                  |
| `JSDoc.tag(path, tagName)`                        | The text of the tag with that name.                                                |
| `JSDoc.tags(path, tagName)`                       | The texts of every tag with that name, as a list.                                  |
| `JSDoc.hasTag(path, tagName)`                     | `true` if the doc comment has that tag.                                            |

`path` is `path/to/file.ts#ExportName`, relative to the workspace root. `tagName` has no `@`, for
example `deprecated`.

## Keywords

| Written as                                                              | Links to                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `*` and a page keyword                                                  | A guide page. Unknown page keywords fail the build.                   |
| `*` and a page keyword, `#` and a heading                               | A section of the page.                                                |
| A declaration name                                                      | Its API page.                                                         |
| A declaration name, `.` and a member                                    | A member of the API page. Getters and setters take `get-` and `set-`. |
| A declaration name, `#` and a heading                                   | A section of the API page.                                            |
| A global keyword                                                        | The URL from the configuration file.                                  |
| A page keyword or a global keyword with `type: 'link'`, `?` and a query | The same link with query parameters. Other keywords drop the query.   |

See `*LinksAndKeywordsPage`.

## Doc comment tags

Tags in the doc comments of your API change how its API page looks. See `*WriteDocCommentsPage`.

| Tag                       | Effect                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `@deprecated`, `@beta`    | Shows a warning box with the tag text.                           |
| `@experimental`, `@alpha` | Shows an alert box with the tag text.                            |
| `@internal`               | Leaves the declaration or member out of the API pages.           |
| `@see`                    | Adds a link to the "See Also" section. Use keywords in the text. |
| `@remarks`                | Adds a note to the "Notes" section.                              |
| `@example`                | Adds an example to the "Example usage" section.                  |
| `@usageNotes`             | Starts the "Usage Notes" section, after the API tables.          |
| `@param name - text`      | Describes a parameter.                                           |
| `@returns`                | Describes the return value.                                      |
| `@status:<color> <text>`  | On a page configuration only: shows a badge in the sidebar.      |

The status boxes appear only when the tag has text.

{% index false %}

## Related

- `*PageFilesReference`
- `*TemplatesPage`
- `*CodeBlocksPage`

{% endindex %}
