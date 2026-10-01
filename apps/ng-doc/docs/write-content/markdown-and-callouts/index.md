---
keyword: MarkdownAndCalloutsPage
---

Page content is Markdown. NgDoc adds callouts for notes and warnings, heading anchors, and links
from inline code.

## See it

> **Note**
> This is a callout. It highlights information that readers should not miss.

## Use it

Write a blockquote whose first line is a bold callout kind:

```markdown name="index.md"
> **Note**
> This is a callout. It highlights information that readers should not miss.
```

NgDoc supports GitHub-flavored Markdown: headings, emphasis, lists, links, tables, blockquotes and
code. Because each page is also a template, you can use Nunjucks in it (`*TemplatesPage`).

## Callout kinds

A callout is a blockquote whose first line is the kind in bold, such as `Note` in the example
above.

| Kind         | Use it for                               |
| ------------ | ---------------------------------------- |
| `Note`       | Extra information that helps the reader. |
| `Warning`    | Something that can go wrong.             |
| `Alert`      | Something that breaks or loses data.     |
| `Success`    | A confirmation that a step worked.       |
| No bold kind | A quote or an aside, with no icon.       |

Each kind, source first, then the result:

```markdown name="index.md"
> **Warning**
> Save your changes before you restart the server.
```

> **Warning**
> Save your changes before you restart the server.

```markdown name="index.md"
> **Alert**
> This command deletes the generated folder.
```

> **Alert**
> This command deletes the generated folder.

```markdown name="index.md"
> **Success**
> The page is ready.
```

> **Success**
> The page is ready.

```markdown name="index.md"
> A plain blockquote.
```

> A plain blockquote.

## Custom titles

To give a callout its own title, such as a short tip, write the `ng-doc-blockquote` element that a
callout renders as and set `label`. Leave a blank line after the opening tag and before the closing
tag, so the content inside is still Markdown:

```markdown name="index.md"
<ng-doc-blockquote type="note" label="💡 Tip">

Keep one idea per callout.

</ng-doc-blockquote>
```

<ng-doc-blockquote type="note" label="💡 Tip">

Keep one idea per callout.

</ng-doc-blockquote>

`type` sets the colour and the icon, and `label` replaces the kind's title.

## Headings and anchors

Every `h1` to `h4` heading gets an anchor, so readers can link to a section. Page keywords use the
same anchors: `*InstallationPage#manual-setup` links to a section of the Installation page.
`guide.anchorHeadings` in the configuration file changes which heading levels get anchors
(`*ConfigurationReference`).

Start the sections of a page with `##`. The page title is already the `h1`.

## Gotchas

> **Warning**
> The callout kind must open the blockquote as a single bold word. With a colon inside the bold
> text, as below, the blockquote renders as a plain one.

```markdown name="index.md"
> **Note:**
> This renders as a plain blockquote.
```

{% index false %}

## Related

- `*CodeBlocksPage`
- `*LinksAndKeywordsPage`
- `*SyntaxReference`

{% endindex %}

Next: `*CodeBlocksPage`
