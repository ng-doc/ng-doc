---
keyword: WriteDocCommentsPage
---

The text of an API page comes from the doc comments in your code: the comment right before a
declaration or a member that opens with a slash and two stars. NgDoc reads them with the TSDoc parser, renders their Markdown,
and turns the names in inline code into links.

## See it

The page of `NgDocThemeService` is written from these comments, shortened here:

```typescript name="theme.service.ts"
/**
 * Service for managing themes.
 *
 * The theme is the `data-theme` attribute of the document element: `auto`, `dark`, the id of a
 * custom theme, or no attribute for the light theme.
 */
@Service()
export class NgDocThemeService {
  /**
   * The current theme as a signal: the theme id, or `null` for the light theme.
   *
   * It starts with the document's `data-theme` attribute and follows every `set()` call.
   */
  readonly theme: Signal<string | null> = this.themeState.asReadonly();

  /**
   * Sets the theme by id.
   * @param id - Theme id. If not provided, the theme will be removed.
   */
  set(id?: string): void {
    // ...
  }
}
```

## Use it

Write the comment before the declaration. The text before the first tag is the description: it opens
the page. With the new engine, its first paragraph is also the one-line summary in the search and
the API index (`*UpgradeTo22Page#7-the-new-engine`). Use
Markdown in it, and write the names of other declarations in inline code to link them, such as
`` `NgDocThemeService` `` or `` `NgDocThemeService.set` `` for a member (`*LinksAndKeywordsPage`).

```typescript name="button.component.ts"
/**
 * A button with the colors of the site.
 *
 * Use it for the main action of a dialog. For the other actions, use `LinkButtonComponent`.
 */
@Component({
  selector: 'app-button',
  template: `<ng-content />`,
})
export class ButtonComponent {
  /** The size of the button. */
  readonly size = input<'small' | 'medium' | 'large'>('medium');
}
```

For a variable, write the comment before the whole statement, `export const …`.

## Tags

Tags add sections to the page. Each one starts a block that lasts until the next tag.

| Tag                  | Where it shows                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `@deprecated`        | A **Deprecated** callout under the name. The name is struck through.                         |
| `@experimental`      | An **Experimental** callout.                                                                 |
| `@alpha`             | An **Alpha** callout.                                                                        |
| `@beta`              | A **Beta** callout.                                                                          |
| `@remarks`           | The **Notes** section, after the declaration.                                                |
| `@see`               | The **See Also** section. Write a keyword in it to link a page or a declaration.             |
| `@param name - text` | The description of a parameter, in the **Parameters** of a function or a method.             |
| `@returns`           | The description of the return value, in **Returns**.                                         |
| `@example`           | The **Example usage** section. Write Markdown in it, such as a fenced code block.            |
| `@usageNotes`        | The **Usage Notes** section, at the end of the page. Everything after the tag belongs to it. |
| `@internal`          | Nothing: the declaration or member gets no page and no row.                                  |

### Status

`@deprecated`, `@experimental`, `@alpha` and `@beta` mark how stable a declaration or a member is.
The page shows a callout with the status as its title and the tag's text as its content. Deprecated
and beta callouts are warnings, experimental and alpha callouts are alerts.

```typescript name="my-class.ts" {2,6}
/**
 * @beta The options may change in a minor release.
 */
export class MyClass {
  /**
   * @deprecated Use `format` instead.
   */
  toText(): string {
    return '';
  }
}
```

The callout needs text: a status tag without text only strikes the name through, for
`@deprecated`, or changes nothing.

### Notes and See Also

`@remarks` adds a note after the declaration. Use several tags for several notes. `@see` adds a line
to **See Also**, usually a keyword with a comment:

```typescript name="my-class.ts" {4-5}
/**
 * Formats dates for the reader's locale.
 *
 * @remarks The locale is read once, when the class is created.
 * @see `MyParser` (it reads the dates that this class formats)
 */
export class MyFormatter {}
```

The classes that extend a class are listed under **Extended by**, so you don't need `@see` for
them.

### Examples and usage notes

````typescript name="my-class.ts" {4-10}
/**
 * Formats dates for the reader's locale.
 *
 * @example
 * ```typescript
 * const formatter = new MyFormatter();
 * formatter.format(new Date());
 * ```
 * @usageNotes
 * Create one formatter and share it: creating it reads the locale.
 */
export class MyFormatter {}
````

## Members

Members of classes and interfaces take the same comments. In the members table, a row shows the
description, the status callout, the `@remarks` of the member as **Notes**, and its `@example`
blocks. The expanded row of a method shows its parameters from `@param`, its return value from
`@returns`, and its examples:

```typescript name="my-formatter.ts" {4-6}
export class MyFormatter {
  /**
   * Formats a date.
   * @param date - The date to format.
   * @param pattern - The pattern, such as `yyyy-MM-dd`. It defaults to the locale's pattern.
   * @returns The formatted date.
   */
  format(date: Date, pattern?: string): string {
    return date.toISOString();
  }
}
```

A member without a comment takes the comment of the member that it overrides or implements, so an
implementation of an interface doesn't need to repeat it.

Members have no **See Also** or **Usage Notes**: put those on the declaration.

## Functions

A function page shows **Returns**, **Parameters** and **Overloads** after the declaration, from the
comment of the function:

```typescript name="to-array.ts"
/**
 * Wraps a value in an array, unless it is one already.
 * @param value - The value or the array.
 * @returns An array.
 */
export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
```

## Gotchas

> **Warning**
> Only a doc comment, opened with a slash and two stars, counts. Line comments, and block comments
> opened with one star, are ignored.

> **Note**
> Write `@param name - text`, with the hyphen. It is the TSDoc form, and it keeps the parameter's
> name out of its description.

{% index false %}

## Related

- `*GenerateApiPagesPage`
- `*EmbedApiInGuidesPage`
- `*SyntaxReference#doc-comment-tags`

{% endindex %}

Next: `*EmbedApiInGuidesPage`
