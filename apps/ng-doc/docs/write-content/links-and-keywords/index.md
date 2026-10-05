---
keyword: LinksAndKeywordsPage
---

Keywords turn inline code into links. Write the name of a page, a declaration or an external
resource in backticks, and NgDoc links it. When a page moves, its links keep working.

## 👀 See it

- A page keyword: `*InstallationPage`
- A page keyword with an anchor: `*InstallationPage#manual-setup`
- An API keyword: `NgDocPage`
- A global keyword: `nunjucks`

## 🧰 Use it

Give a page a keyword in its front matter:

```markdown name="index.md" {2}
---
keyword: InstallationPage
---
```

Then link to it from any page with inline code that starts with `*`:

```markdown name="index.md"
Read `*InstallationPage` first.
```

Declarations in your API scopes don't need a keyword. Their name is the keyword:

```markdown name="index.md"
Every page exports an `NgDocPage` object.
```

## Kinds of keywords

| Kind   | Written as                  | Defined by                                                                             | Unknown keyword  |
| ------ | --------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| Page   | `*` followed by the keyword | `keyword` in the front matter of a page or tab, or in `ng-doc.api.ts` for the API list | Build error      |
| API    | The declaration name        | Every declaration in the `ng-doc.api.ts` scopes                                        | Stays plain text |
| Global | The key                     | `keywords` in the configuration file                                                   | Stays plain text |

The `*` prefix marks a page keyword. It lets NgDoc report a link to a page that no longer exists,
instead of rendering plain text.

## Anchors

Add an anchor to link to part of a page.

- **Page sections:** add `#` and the heading's slug, for example `*InstallationPage#manual-setup`.
  The slug is the heading text in lowercase, with punctuation removed and spaces replaced by
  dashes: `## 5. Add the providers` becomes `5-add-the-providers`, and `## 4. Map @ng-doc/generated`
  becomes `4-map-ng-docgenerated`.
- **API sections:** add `#` and the section heading, for example `NgDocBaseInput#methods`.
- **API members:** add `.` and the member name.

```markdown name="index.md"
- Property: `NgDocBaseInput.changes`
- Method: `NgDocBaseInput.focus`
- Getter: `NgDocBaseInput.get-value`
```

- Property: `NgDocBaseInput.changes`
- Method: `NgDocBaseInput.focus`
- Getter: `NgDocBaseInput.get-value`

Getters and setters take a `get-` or `set-` prefix. Page and section anchors are not
case-sensitive.

## Query parameters

Add query parameters after `?`, as in a URL. They work on links to pages, such as the API list
page, and on global keywords with `type: 'link'`. API keywords and other global keywords drop them.
This link opens the API list filtered to classes:

```markdown name="index.md"
`*ApiReferences?type=Class`
```

`*ApiReferences?type=Class`

## Inline code with other text

Inline code that reads as TypeScript, such as a call, a generic type or a signature, links the
names it uses, the way a code block does: `provideNgDocApp()` and `Array<NgDocPage>` both link.
Other inline code links only when all of it is one keyword, with an optional anchor or query
parameters, so file names such as `vite.ng-doc.config.mjs`, paths, commands, HTML tags and
sentences stay plain text.

## Keywords in code blocks

API keywords also work inside TypeScript and HTML code blocks. Hover a linked name to see its
description:

```typescript name="size.ts"
import { NgDocSize } from '@ng-doc/ui-kit';

const size: NgDocSize = 'small';
```

In HTML code blocks, NgDoc links the selectors of your components and directives:

```html name="button.html"
<button ng-doc-button>Click me</button>
```

NgDoc links the names that code uses: imports, types, class names, calls and their arguments. It
doesn't link object keys, property and parameter names, strings, comments, TypeScript keywords
such as readonly, or names the example declares itself, such as a constant or an import from a
relative path. A member after a dot links only when the owner and the member together are an API
keyword, like `NgDocBaseInput.changes`. In HTML code blocks, attribute values and comments stay
plain text.

## 🔗 Global keywords

Global keywords link to external sites. Define them under `keywords.keywords` in the configuration
file:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  keywords: {
    keywords: {
      nunjucks: {
        title: 'Nunjucks',
        url: 'https://mozilla.github.io/nunjucks/',
      },
    },
  },
};

export default config;
```

`title` is optional; the key is used by default. To load keywords for Angular, RxJS or another
NgDoc site, use keyword loaders (`*LinkToExternalApisPage`).

## 🚧 Gotchas

> **Warning**
> A page keyword that doesn't exist fails the build, and so does an unknown anchor on a page
> keyword or an API keyword. Check the spelling, and remember that keyword names are
> case-sensitive.

{% index false %}

## Related

- `*LinkToExternalApisPage`
- `*GenerateApiPagesPage`
- `*ConfigurationReference`

{% endindex %}

Next: `*TemplatesPage`
