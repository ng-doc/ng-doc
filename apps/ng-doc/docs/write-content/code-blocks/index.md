---
keyword: CodeBlocksPage
---

Code blocks show source code with syntax highlighting. NgDoc adds file names, code groups,
highlighted lines, and code loaded from real files, so examples can't drift from the code.

## 👀 See it

```typescript name="greeting.ts" file="./examples/greeting.ts"#L1-L6 {3}

```

This block loads its code from a real file, names it and highlights line 3.

## 🧰 Use it

Write a fenced code block with a language, then add attributes after the language:

````markdown name="index.md"
```typescript name="greeting.ts" {3}
export const greet = (name: string): string => {
  const greeting = `Hello, ${name}!`;
  return greeting;
};
```
````

Attributes are separated by spaces. Values go in double quotes. `*SyntaxReference` lists every
attribute.

| Attribute       | Effect                                             |
| --------------- | -------------------------------------------------- |
| `name="…"`      | Shows a file name above the code.                  |
| `group="…"`     | Puts the block in a code group with the same name. |
| `active`        | Opens this block first in its code group.          |
| `icon="…"`      | Shows an icon next to the name.                    |
| `{1,3-5}`       | Highlights lines 1, 3, 4 and 5.                    |
| `file="./path"` | Loads the code from a file.                        |

## File names

````markdown name="index.md"
```typescript name="my-file.ts"
const message = 'Hello world';
```
````

```typescript name="my-file.ts"
const message = 'Hello world';
```

## Code groups

Blocks with the same `group` show as tabs. Each block's `name` is its tab label.

````markdown name="index.md"
```bash group="install" name="npm"
npm install @ng-doc/core
```

```bash group="install" name="yarn"
yarn add @ng-doc/core
```
````

```bash group="install" name="npm"
npm install @ng-doc/core
```

```bash group="install" name="yarn"
yarn add @ng-doc/core
```

The first block is open by default. Add `active` to open another one:

````markdown name="index.md"
```bash group="install-active" name="npm"
npm install @ng-doc/core
```

```bash group="install-active" name="yarn" active
yarn add @ng-doc/core
```
````

```bash group="install-active" name="npm"
npm install @ng-doc/core
```

```bash group="install-active" name="yarn" active
yarn add @ng-doc/core
```

## Icons

`icon` shows an icon next to the name, in single blocks and in code groups.

````markdown name="index.md"
```typescript name="app.ts" icon="angular"
@Component({ selector: 'app-root', template: '' })
export class App {}
```
````

```typescript name="app.ts" icon="angular"
@Component({ selector: 'app-root', template: '' })
export class App {}
```

{% include "../../shared/registering-icons.md" %}

## Highlighted lines

Put line numbers in braces after the language. Separate them with commas, and use a dash for a
range. With `file`, the numbers count the lines that the block shows: after the `#L` range is
applied and hidden lines are removed.

````markdown name="index.md"
```typescript name="ng-doc.page.ts" {1,3-6}
import { NgDocPage } from '@ng-doc/core';

const MyPage: NgDocPage = {
  title: 'My page',
  mdFile: './index.md',
};

export default MyPage;
```
````

```typescript name="ng-doc.page.ts" {1,3-6}
import { NgDocPage } from '@ng-doc/core';

const MyPage: NgDocPage = {
  title: 'My page',
  mdFile: './index.md',
};

export default MyPage;
```

## Code from a file

`file` loads the code from a file, relative to the Markdown file. Leave the block empty. NgDoc
shows the code as it is in the file, without reformatting it. The examples on this page load
`examples/greeting.ts`:

```typescript name="greeting.ts" file="./examples/greeting.ts"

```

````markdown name="index.md"
```typescript name="greeting.ts" file="./examples/greeting.ts"

```
````

Add `#L` and line numbers right after the closing quote to load only some lines. The numbers refer
to lines in the file.

| Suffix    | Loads                          |
| --------- | ------------------------------ |
| `#L8-L10` | Lines 8 to 10.                 |
| `#L8`     | Line 8 only.                   |
| `#L8-`    | Line 8 to the end of the file. |

````markdown name="index.md"
```typescript name="greeting.ts" file="./examples/greeting.ts"#L8-L10

```
````

```typescript name="greeting.ts" file="./examples/greeting.ts"#L8-L10

```

## Hiding lines

A comment with `ng-doc-ignore-line` hides lines from code that NgDoc loads from a file, from demos
and from snippets. It removes the line with the comment and the line after it. Add a number to
remove more lines after it: `// ng-doc-ignore-line 3`.

This is the source of `examples/greeting.ts`:

```typescript name="greeting.ts"
export const greet = (name: string): string => {
  // ng-doc-ignore-line
  console.debug('greet', name);

  return `Hello, ${name}!`;
};
```

Loaded with `file`, the comment and the `console.debug` line are gone:

```typescript name="greeting.ts" file="./examples/greeting.ts"#L1-L6

```

The comment works in `//`, `/* */` and `<!-- -->` form, so you can use it in TypeScript, styles and
templates.

## 🚧 Gotchas

> **Warning**
> The comment also removes the line after it. A comment at the end of a line of code, such as
> `foo(); // ng-doc-ignore-line`, removes that line and the next one.

{% index false %}

## Related

- `*SnippetsPage`
- `*DiagramsPage`
- `*CodeHighlightingPage`
- `*SyntaxReference`

{% endindex %}

Next: `*ImagesVideoAndEmbedsPage`
