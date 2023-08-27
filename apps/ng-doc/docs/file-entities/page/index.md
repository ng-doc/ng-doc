# {{ NgDocPage.title }}

The page is the main building block of your guides, which you can use to describe some
cool features of your project, show various demos, write guides and do many other things
that are useful to your users.

## Creating a page

All pages should have the file name `ng-doc.page.ts`, this helps to find these pages in your code
and render their content.
In order to create a page you can use special schematic, you can call it even without parameters,
it will ask questions and show hints for required properties. You can find all available options in
the interface `NgDocBuildPageSchema`

{% include "../../shared/schematic-exec-path.md" %}

```bash
ng g @ng-doc/builder:page "Installation"
```

This command will create a folder with your page name and generate `ng-doc.page.ts` and `index.md`
files inside, you can also provide additional parameters to the schematic, for example, you can
specify
`--category` (alias is `-c`) option to import parent category into your page automatically.

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.page.ts` file should contain your page configuration,
the page configuration must correspond to the `NgDocPage` type, you can read more about the various
properties in the documentation for the type, below is an example of the minimum page configuration.

```typescript name="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';

const MyAwesomePage: NgDocPage = {
  title: 'MyAwesomePage',
  mdFile: './index.md',
};

export default MyAwesomePage;
```

## Adding a category

You can use categories to structure your documentation (see the `*EntitiesCategory` article
for details on how to create one). To add a category to your page, you can use the `category` field,
just import category and put it in the `category` field, just like that:

```typescript name="ng-doc.page.ts" {2,7}
import {NgDocPage} from '@ng-doc/core';
import MyAwesomeCategory from '../ng-doc.category';

const MyAwesomePage: NgDocPage = {
  title: 'MyAwesomePage',
  mdFile: './index.md',
  category: MyAwesomeCategory,
};

export default MyAwesomePage;
```

## Creating a content

Once you've created a page, you can start adding content to your `mdFile`, describing cool things
about your application, and so on. NgDoc automatically collects all of your page's dependencies and
rebuilds page if needed.

Your page content fully supports the `markdown` syntax, but it is
extended with the `nunjucks` engine which allows you to reuse one template for multiple pages, or
render content dynamically, see `*GuidesTemplating` for more details.

## Angular dependencies

Some page configuration fields can take values that depend on Angular packages, for example, the
`demos` field, which should contain a list of Angular components. This works because NgDoc trims the
data in these fields when used on the builder side to increase compilation speed and dynamic loading
of such pages.

NgDoc doesn't trim all fields, only those that are not needed during the page build phase on the
builder side. For example, the `controls` field that you can use for each of the playgrounds is not
trimmed because it is required on the builder side. If you try to dynamically set the value of this
field based on a variable that depends on the Angular library, you will likely encounter an error.

You have several ways to work around this:

### Separate file

If the variable does not depend on Angular but is only located in a file with other entities that
use Angular, you can move it to a separate file so that the variable file does not contain Angular
imports.

```typescript {2,10} name="Will not work" group="separate-files"
import {NgDocPage} from '@ng-doc/core';
import {ControlsVariable} from '../file-with-angular-dependencies';

const MyAwesomePage: NgDocPage = {
  // ...
  playgrounds: {
    MyPlayground: {
      // ...
      controls: {
        ...ControlsVariable,
      },
    },
  },
};

export default MyAwesomePage;
```

```typescript {2,10} name="Will work" group="separate-files"
import {NgDocPage} from '@ng-doc/core';
import {ControlsVariable} from '../file-without-angular';

const MyAwesomePage: NgDocPage = {
  // ...
  playgrounds: {
    MyPlayground: {
      // ...
      controls: {
        ...ControlsVariable,
      },
    },
  },
};

export default MyAwesomePage;
```

### Import compiler

Alternatively, you can import `@angular/compiler` in your page file `ng-doc.page.ts`, so Angular
dependencies will be handled correctly on the builder side.

> **Warning**
> This method may slow down the builder or cause additional errors, so use it as a last resort.

```typescript {1} name="ng-doc.page.ts"
import '@angular/compiler';
import {NgDocPage} from '@ng-doc/core';

const MyAwesomePage: NgDocPage = {
  // ...
};

export default MyAwesomePage;
```

{% index false %}

## See also

- `*EntitiesCategory`
- `*GuidesTemplating`
- `*GuidesDemo`

{% endindex %}
