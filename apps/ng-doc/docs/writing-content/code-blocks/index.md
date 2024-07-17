Code blocks are supported by default as in `markdown`, but you can also use additional features.

### Naming

To add a name to your code block, you can specify the `name` parameter using code block metadata

````markdown name="index.md"
```typescript name="my-file.ts"
const myVar = 'Hello world';
```
````

```typescript name="my-file.ts"
const myVar = 'Hello world';
```

### Grouping

Several code blocks can be grouped together, for this you need to specify the `group` and `name`
parameters, for each code block you want to group, for example, to group two code blocks, you can write
the following

````markdown name="index.md"
```typescript group="my-group1" name="world"
const myVar = 'Hi world!';
```

```typescript group="my-group1" name="mom"
const myVar = 'Hi Mom!';
```
````

```typescript group="my-group1" name="world"
const myVar = 'Hi world!';
```

```typescript group="my-group1" name="mom"
const myVar = 'Hi Mom!';
```

By default, first tab will be active, but you can specify the active tab by adding `active`
parameter to change that.

````markdown name="index.md"
```typescript group="my-group2" name="world"
const myVar = 'Hi world!';
```

```typescript group="my-group2" name="mom" active
const myVar = 'Hi Mom!';
```
````

```typescript group="my-group2" name="world"
const myVar = 'Hi world!';
```

```typescript group="my-group2" name="mom" active
const myVar = 'Hi Mom!';
```

### Icons

You can add icons to your code blocks, for this you need to specify the `icon` parameter,
this will fork for groups and single code blocks, for example, to add icon to a single code block,
you can write the following.

{% include "../../shared/registering-icons.md" %}

````markdown name="index.md"
```typescript name="my.component.ts" icon="angular"
@Component()
export class MyComponent {}
```
````

```typescript name="my.component.ts" icon="angular"
@Component()
export class MyComponent {}
```

### Lines highlighting

You can highlight specific lines in your code block, for this you need to specify the line numbers
you want to highlight after the language name, for example, to highlight line 3, you can write the
following

````markdown name="index.md"
```typescript {3}
const myVar = 'Hello world';

console.log(myVar);
```
````

```typescript {3}
const myVar = 'Hello world';

console.log(myVar);
```

You can also highlight multiple lines, or lines ranges:

````markdown name="index.md"
```typescript {1,3-5,8}
import { NgDocPage } from '@ng-doc/core';

const NicePage: NgDocPage = {
  title: `What a nice page!`,
  mdFile: './index.md',
};

export default NicePage;
```
````

```typescript {1,3-6,8}
import { NgDocPage } from '@ng-doc/core';

const NicePage: NgDocPage = {
  title: `What a nice page!`,
  mdFile: './index.md',
};

export default NicePage;
```

### Loading code from a file

To load the code from a file you need to specify the `file` parameter,
and the path to the file **relative** to your template

````markdown name="index.md"
```typescript file="./ng-doc.page.ts"

```
````

```typescript file="./ng-doc.page.ts"

```

To load specific lines from the file, you can provide them at the end of the `file` parameter,
for example, to load lines from 4 to 9, you can write the following

````markdown name="index.md"
```typescript file="./ng-doc.page.ts"#L4-L9

```
````

```typescript file="./ng-doc.page.ts"#L4-L9

```

To load one line, you can write this

````markdown name="index.md"
```typescript file="./ng-doc.page.ts"#L11

```
````

```typescript file="./ng-doc.page.ts"#L11

```

And to load from a specific line to the end of the file, you can don't specify the end line

````markdown name="index.md"
```typescript file="./ng-doc.page.ts"#L4-

```
````

```typescript file="./ng-doc.page.ts"#L4-

```
