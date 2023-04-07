# {{ NgDocPage.title }}

When you create `ng-doc.api.ts`, NgDoc will generate documentation for all exported entities in your
project, but they may not always be clear to your users, we will help you fix that in this article.

Documentation for entities is very useful because it is right in the code, which means it can be
read not only on your documentation site, but also during the coding.

> **Note**
> We are trying to support the `tsdoc` standard syntax, you can read more about it on their website

Entity documentation should be written in the form of comments, all comments support the `markdown`
syntax, so we can use any of its functions to make your documentation more pretty.

## Entity documentation

The main part of the documentation should be written in a comment to the entity, in the following
form.

```typescript fileName="my-class.ts"
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

### See Also

You can also add links to other APIs using the `@see` tag and keywords, NgDoc will display them in a
special **See Also** section.

```typescript fileName="my-class.ts"
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
 * @see `AndAnotherOneClass` (you can also add some comments like this)
 */
export class MyClass {}
```

### Usage Notes

To separate the main text from the usage notes/examples, you can use the `@usageNotes` tag, it will
render
the usage notes after the main documentation and API of your entity.
All content you write after the `@usageNotes` tag will be related to it.

```typescript fileName="my-class.ts"
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

```typescript fileName="my-class.ts"
export class MyClass {
<<<<<<<< HEAD:apps/ng-doc/src/app/pages/docs/content/api-templating/index.md
	/**
	 * My awesome docs for the
	 *
	 * @param num This param is really important, and this is the doc for it
	 */
	doSomething(num: number): void {}
========
  /**
   * My awesome docs for the
   *
   * @param num This param is really important, and this is the doc for it
   */
  doSomething(num: number): void {}
>>>>>>>> main:apps/ng-doc/src/app/docs/content/api/templating/index.md
}
```
{% index false %}

## See Also

<<<<<<<< HEAD:apps/ng-doc/src/app/pages/docs/content/api-templating/index.md
-   `*EntitiesAPI`
========
- `*EntitiesAPI`

{% endindex %}
>>>>>>>> main:apps/ng-doc/src/app/docs/content/api/templating/index.md
