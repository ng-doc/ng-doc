---
title: Snippets
route: snippets
keyword: 'SnippetsPage'
---

Snippets are a way to display a part of your code in the demos, they are very useful
when you want to show a specific part of your code.

## Usage

Snippets look like comments, and you can use them in any of your demos, and they will be
displayed in the demo's code tab. For example, in your demo code you can leave a comment to
create a snippet like this:

> **Note**
> Snippets also work for components with multiple files

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  onClick(): void {
    // snippet
    console.log('Hello world');
    // snippet
  }
}
```

## Title

To give a title to your snippet, you can use the following syntax:

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  onClick(): void {
    // snippet "My Custom Title"
    console.log('Hello world');
    // snippet
  }
}
```

## Icon

To specify an icon to your snippet, you can add `icon` parameter to your snippet, for example:

{% include "../../shared/registering-icons.md" %}

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  onClick(): void {
    // snippet icon="angular"
    console.log('Hello world');
    // snippet
  }
}
```

## Opened by default

If you have several snippets in your demo, first one will be opened by default, but you can
change that by adding `opened` parameter to your snippet, for example:

```typescript name="demo.component.ts"
// snippet
@Component({
  /* ... */
})
// snippet
export class DemoComponent {
  onClick(): void {
    // snippet "My Snippet" opened
    console.log('Hello world');
    // snippet
  }
}
```

You can also do that by providing your snippet title to the `defaultTab` property of the
`demo` or `demoPane` method, for example:

> **Note** `defaultTab` property has priority over `opened` snippet parameter.

```twig name="index.md"
{{ '{{ NgDocActions.demo("DemoComponent", {defaultTab: "My Snippet"}) }}' | safe }}
```

## Nested snippets

You can also nest snippets, but to do so, you need to give an id to your snippet,
the id is used to identify the start and end of the snippet, for example:

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  onClick(): void {
    // snippet#s1
    console.log('Hello world!');
    // snippet#s2
    console.log('Hello Mom!');
    // snippet#s2
    // snippet#s1
  }
}
```

So the snippet with id `s1` will include the code between `// snippet#s1` and `// snippet#s1`
including the snippet with id `s2`, and the snippet with id `s2` will include the code between
`// snippet#s2` and `// snippet#s2`.

## Language

Snippets language is automatically detected based on the comment type, e.g. `<!-- snippet -->`
will be detected as `html` and `// snippet` or `/* snippet */` will be detected as `typescript`,
in your stylesheets you can also use `// snippet` but then you need to specify the language
like on the following example:

```typescript name="demo.component.ts"
@Component({
  styles: [
    `
      // snippet:css
      .my-class {
        color: red;
      }
      // snippet
    `,
  ],
})
export class DemoComponent {}
```

If you are using nested snippets, you must specify the language after the snippet id, for example:

```typescript name="demo.component.ts"
@Component({
  styles: [
    `
      // snippet#s1:css
      .my-class {
        color: red;
      }
      // snippet#s1
    `,
  ],
})
export class DemoComponent {}
```

## Loading snippet from file

Snippet code can be loaded from a file, to do so, you need to use `snippet-from-file` comment,
this version of the snippet also supports `title`, `icon`, `opened` and `language` parameters,
for example:

> **Warning**
> Path is relative to the demo file. Snippets in loaded files are not supported and will be ignored.

```typescript name="demo.component.ts"
// snippet-from-file="./another.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  onClick(): void {}
}
```

## Example

On the following example you can see how to use snippets in your demos and how they are displayed

```typescript file="./demos/button-inline-demo/button-inline-demo.component.ts" name="button-inline-demo.component.ts" {5,12,14,19,22,25,27}

```

{{ NgDocActions.demo("ButtonInlineDemoComponent", {expanded: true}) }}
