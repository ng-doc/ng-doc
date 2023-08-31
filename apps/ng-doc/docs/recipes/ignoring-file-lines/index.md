# {{ NgDocPage.title }}

Sometimes you need to hide some parts of your code to make it easier when you use demos or when
you load code from a file via the `file` parameter in the code block. This helps to make your
documentation more readable and understandable and don't overload it with unnecessary information.

## Hiding lines

To hide some lines of code, you can use comments with the `ng-doc-ignore-line` text,
in the example below, the constructor will be hidden if you display the code in the demo or
load its code from a file.

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  // ng-doc-ignore-line
  constructor() {}

  onClick(): void {
    console.log('Hello world');
  }
}
```

You can also hide multiple lines, for example, to hide 5 lines after the comment, you can write
the following:

```typescript name="demo.component.ts"
@Component({
  /* ... */
})
export class DemoComponent {
  // ng-doc-ignore-line 5
  constructor() {}

  onClick(): void {
    console.log('Hello world');
  }
}
```
