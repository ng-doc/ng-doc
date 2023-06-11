# {{ NgDocPage.title }}

NgDoc uses `markdown` to render your pages, but we have added some additional features to make
your documentation more readable and understandable.

## Code block

Code blocks are supported by default as in `markdown`, but we have added some additional features.

### Lines highlighting

You can highlight specific lines in your code block, for this you need to specify the line numbers
you want to highlight after the language name, for example, to highlight line 3, you can write the
following

````markdown fileName="index.md"
```typescript {3}
const myVar = 'Hello world';

console.log(myVar);
```
````

```typescript {3}
const myVar = 'Hello world';

console.log(myVar);
```

You can also highlight multiple lines, or lines range, for example, to highlight lines 1, 8 and from 3
to 6, you can write the following

````markdown fileName="index.md"
```typescript {1,3-5,8}
import {NgDocPage} from '@ng-doc/core';

const NicePage: NgDocPage = {
  title: `What a nice page!`,
  mdFile: './index.md',
};

export default NicePage;
```
````

```typescript {1,3-6,8}
import {NgDocPage} from '@ng-doc/core';

const NicePage: NgDocPage = {
  title: `What a nice page!`,
  mdFile: './index.md',
};

export default NicePage;
```


### Defining a File name

You can specify `fileName` attribute to render the code block with a file name

````markdown fileName="index.md"
```typescript fileName="my-file.ts"
const myVar = 'Hello world';
```
````

```typescript fileName="my-file.ts"
const myVar = 'Hello world';
```

### Loading code from a file

You can also load the code from a file, for this you need to specify the `file` attribute,
and the path to the file **relative** to your template

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts"

```
````

```typescript file="./ng-doc.page.ts"

```

To load specific lines from the file, you can provide them at the end of the `file` attribute,
for example, to load lines from 5 to 11, you can write the following

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts"#L5-L11

```
````

```typescript file="./ng-doc.page.ts"#L5-L11

```

To load one line, you can write this

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts"#L13

```
````

```typescript file="./ng-doc.page.ts"#L13

```

And to load from a specific line to the end of the file, you can write the following

````markdown fileName="index.md"
```typescript file="./ng-doc.page.ts"#L5-

```
````

```typescript file="./ng-doc.page.ts"#L5-

```

### Blockquotes

NgDoc supports default blockquotes and some custom blockquotes, for example, you can use
`Note` and `Warning` blockquotes to highlight some important information in your guides

```markdown fileName="index.md"
> Default blockquote

> **Note**
> This is note blockquote

> **Warning**
> This is warning blockquote
```

> Default blockquote

> **Note**
> This is note blockquote

> **Warning**
> This is warning blockquote
