---
keyword: SnippetsPage
---

Snippets show the part of a demo's code that matters. Mark a piece of a source file with snippet
comments, and the demo shows that piece as a tab of its own instead of the whole file.

## 👀 See it

{{ NgDocActions.demo("SnippetsDemoComponent", { expanded: true }) }}

The demo's single TypeScript file holds three snippets. They are marked like this:

```typescript name="snippets-demo.component.ts" file="../examples/snippets-demo/snippets-demo.component.ts" {8,12,15,20,25,32}

```

## 🧰 Use it

Put a `snippet` comment before and after the code to show:

```typescript name="demo.component.ts"
export class DemoComponent {
  onClick(): void {
    // snippet
    console.log('Hello world');
    // snippet
  }
}
```

A snippet comment is a whole line. It can be a `//`, `/* */` or `<!-- -->` comment, so snippets work
in TypeScript, in styles and in templates, including inline templates and styles. The comment lines
themselves are not shown.

When a file has snippets, the demo shows its snippets instead of the file. A file without snippets
is shown whole.

| Parameter           | Example                             | Effect                                                              |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Title               | `// snippet "Click handler"`        | Names the tab. Untitled snippets are named `Snippet #1`, and so on. |
| `icon`              | `// snippet icon="angular"`         | Shows an icon in the tab.                                           |
| `opened`            | `// snippet opened`                 | Opens this snippet first when the demo is `expanded`.               |
| `#id`               | `// snippet#outer`                  | Names the snippet, so it can contain other snippets.                |
| `:lang`             | `/* snippet:css */`                 | Sets the language of the code.                                      |
| `snippet-from-file` | `// snippet-from-file="./demo.css"` | Shows the content of another file.                                  |

Parameters are separated by spaces, and the `#id` and `:lang` suffixes come right after the word
`snippet`: `// snippet#outer:scss "Styles" opened`.

## Title

```typescript name="demo.component.ts"
// snippet "Click handler"
onClick(): void {
  console.log('Hello world');
}
// snippet
```

## Icon

{% include "../../shared/registering-icons.md" %}

```typescript name="demo.component.ts"
// snippet "Click handler" icon="angular"
onClick(): void {
  console.log('Hello world');
}
// snippet
```

## Opened by default

A demo opened with `expanded` shows the snippet marked `opened` first:

```typescript name="demo.component.ts"
// snippet "Click handler" opened
onClick(): void {
  console.log('Hello world');
}
// snippet
```

Without `opened`, it shows the tab named by the `defaultTab` option, then the first tab:

```twig name="index.md"
{{ '{{ NgDocActions.demo("DemoComponent", { expanded: true, defaultTab: "Click handler" }) }}' | safe }}
```

The `opened` parameter wins over `defaultTab`. A demo pane uses only `defaultTab`.

## Nested snippets

A snippet ends at the next snippet comment, so to put one snippet inside another, give the outer one
an id. It then ends at the next comment with the same id:

```typescript name="demo.component.ts"
// snippet#outer "Whole method"
onClick(): void {
  // snippet "Log"
  console.log('Hello world');
  // snippet
}
// snippet#outer
```

The `Whole method` tab shows the method; the `Log` tab shows only the `console.log` line.

## Language

The language of a snippet follows its comment: `<!-- -->` snippets are Angular templates, and `//`
and `/* */` snippets are TypeScript. For styles, add the language after `snippet`, or after the id:

```typescript name="demo.component.ts"
@Component({
  selector: 'app-demo',
  template: '',
  styles: `
    /* snippet:css "Styles" */
    :host {
      display: block;
    }
    /* snippet */
  `,
})
export class DemoComponent {}
```

`:styles` uses the language of the file for a stylesheet, and the inline style language of the
project for styles in a TypeScript file.

A snippet whose language is set to `ts`, `typescript`, `js`, `javascript`, `html`, `css`, `scss`,
`less` or `sass` is formatted with Prettier, with the Prettier configuration of your workspace.
Snippets in the default languages or with `:styles` keep their code as written, and so do demo
files without snippets and code blocks loaded with `file`.

## Load a snippet from a file

`snippet-from-file` shows the content of another file as a tab, with the same title, `icon`,
`opened` and language parameters. The title defaults to the file name. The language follows the
comment, not the file's extension, so set it after the closing quote for another kind of file:
`// snippet-from-file="./demo.css":css`. The path is relative to the demo file:

```typescript name="demo.component.ts"
// snippet-from-file="./demo.service.ts" "Service"
@Component({
  selector: 'app-demo',
  template: '',
})
export class DemoComponent {}
```

## 🚧 Gotchas

> **Warning**
> Snippet comments in a file loaded with `snippet-from-file` are ignored: the whole file is shown.

<ng-doc-blockquote type="note" label="💡 Tip">

Snippets don't hide lines. To leave out a line inside a snippet, use `ng-doc-ignore-line`
(`*CodeBlocksPage#hiding-lines`).

</ng-doc-blockquote>

{% index false %}

## Related

- `*DemosPage`
- `*DemoPanePage`
- `*CodeBlocksPage`

{% endindex %}

Next: `*PlaygroundsPage`
