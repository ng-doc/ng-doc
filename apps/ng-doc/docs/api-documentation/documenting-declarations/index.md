---
keyword: DocumentingDeclarationsPage
---

Declaration documentation should be written in the form of comments, all comments support
the `markdown`
syntax, so we can use any of its functions to make your documentation more pretty.

## Documenting declaration

The main part of the documentation should be written in a comment to the entity, in the following
form.

```typescript name="my-class.ts"
/**
 * Lorem Ipsum is simply dummy text of the printing and typesetting industry.
 * Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,
 * when an unknown printer took a galley of type and scrambled it to make a type specimen book.
 *
 * It has survived not only five centuries, but also the leap into electronic typesetting,
 * remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset
 * sheets containing Lorem Ipsum passages, and more recently with desktop publishing software
 * like Aldus PageMaker including versions of Lorem Ipsum.
 */
export class MyClass {}
```

## JSDoc tags

### @alpha, @beta, @experimental, @deprecated

You can use the `@alpha`, `@beta`, `@experimental`, and `@deprecated` tags to mark the stability of
your declaration. NgDoc will display them using blockquotes with the corresponding color.

```ts name="my-class.ts" {2,6}
/**
 * @alpha Use this class with caution, it's not stable yet
 */
export class MyClass {
  /**
   * @deprecated This method is deprecated, use `doSomethingElse` instead
   */
  publicProperty: string;
}
```

### @internal

To hide the declaration from the public API, you can use the `@internal` tag, NgDoc will skip
such declarations in the API documentation and do not render them in the API Reference.

```ts name="my-class.ts" {2,6}
/**
 * @internal
 */
export class MyClass {
  /**
   * @internal
   */
  publicProperty: string;
}
```

### @see

To add links to other APIs or pages you can use the `@see` tag and keywords, NgDoc will display
them in a special **See Also** section.

```typescript name="my-class.ts" {11-12}
/**
 * Lorem Ipsum is simply dummy text of the printing and typesetting industry.
 * Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,
 * when an unknown printer took a galley of type and scrambled it to make a type specimen book.
 *
 * It has survived not only five centuries, but also the leap into electronic typesetting,
 * remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset
 * sheets containing Lorem Ipsum passages, and more recently with desktop publishing software
 * like Aldus PageMaker including versions of Lorem Ipsum.
 *
 * @see `MyAnotherClass`
 * @see `AndAnotherOneClass` (you can also add some additional comments like this)
 */
export class MyClass {}
```

### @usageNotes

To separate the main text from the usage notes/examples, you can use the `@usageNotes` tag, it will
render the usage notes after the main documentation and API of your entity. All content you write
after the `@usageNotes` tag will be related to it.

```typescript name="my-class.ts" {11}
/**
 * Lorem Ipsum is simply dummy text of the printing and typesetting industry.
 * Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,
 * when an unknown printer took a galley of type and scrambled it to make a type specimen book.
 *
 * It has survived not only five centuries, but also the leap into electronic typesetting,
 * remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset
 * sheets containing Lorem Ipsum passages, and more recently with desktop publishing software
 * like Aldus PageMaker including versions of Lorem Ipsum.
 *
 * @usageNotes
 *
 * All this content will be rendered in the Usage Notes section
 *
 */
export class MyClass {}
```

## Function/Method

Documentation for methods and functions is written in the same way, using comments,
to add documentation to the parameters, use the `@param` tag and parameter name.

> **Note**
> Class and interface methods do not support tags like `@see` and `@usageNotes`

```typescript name="my-class.ts" {5}
export class MyClass {
  /**
   * My awesome docs for the
   *
   * @param num This param is really important, and this is the doc for it
   */
  doSomething(num: number): void {}
}
```

### @returns

To add a description of the return value, you can use the `@returns` tag. This will render the
description of the return value in the API documentation.

```typescript name="my-class.ts" {6}
export class MyClass {
  /**
   * My awesome docs for the
   *
   * @param num This param is really important, and this is the doc for it
   * @returns This method returns a string
   */
  doSomething(num: number): string {
    return 'Hello world';
  }
}
```
