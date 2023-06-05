# {{ NgDocPage.title }}

Keywords allow you not to tie your documentation to certain links, as well as make it more dynamic,
as a result, mentions of certain entities or pages will turn into links automatically.

> **Warning**
> Keywords are case-sensitive and only support PascalCase, so if you want to create a link to
> an entity you must specify the correct case of the entity name.

## Auto-Generated keywords

NgDoc automatically generates keywords for all declarations specified in `ng-doc.api.ts` (
see `*EntitiesAPI` for how to create it), for example, if you have a class declaration that's called
`MyAwesomeClass`, NgDoc generates keyword `MyAwesomeClass` for it, this means that if you decide to
mention this class as inline code or block code, NgDoc will automatically create a link to the API
page of this declaration.

For example here is the block code, that uses one of types from our Ui-Kit.

```typescript
import {NgDocSize} from './size';

const size: NgDocSize = 'small';
```

## Page keywords

You can also use this functionality to create links to other pages, so if you decide to move a page
from one category to another, you don't have to search the documentation for paths that no longer
work.

> **Note**
> To turn a page keyword into a link, use the inline code (should start with `*` symbol)
> in which you specify the keyword

We have added a special prefix `*` to use page keywords to notify you of outdated links. So, to
create keyword for the page, specify your preferred keyword in your page configuration in
the `keyword` field.

```typescript fileName="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';

export const MyAwesomePage: NgDocPage = {
  title: 'My Awesome Page',
  mdFile: './index.md',
  // This keyword can be used to create a link to the page
  // (e.g. like that "*MyCustomKeyword")
  keyword: `MyCustomKeyword`,
};

export default MyAwesomePage;
```

After that, you can use this keyword to create a link to the page.

```markdown
Link to the page: `*MyCustomKeyword`
```

## Global keywords

Sometimes it is necessary to create links to third-party documentation or just to other sites,
to create such links you can use global keywords that can be declared in the configuration file,
you can read about it in the `*GettingStartedConfiguration` article.

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';

const config: NgDocConfiguration = {
  keywords: {
    google: {
      path: 'https://google.com/',
    },
  },
};

export default config;
```

After that, you can use this keyword to create a link to the page.

```markdown
Link to the page: `google`
```

## Anchors

To make your keywords more accurate, you can use anchors, which are specified after the keyword
separated by a dot or a hash sign.

> **Note**
> Anchors are not case-sensitive, so you can use any case you want.

```markdown
Guide`s anchors:

- Link to the section in guides - `*GettingStartedInstallation#Manual`
- Link to the section in guides - `*GettingStartedInstallation#Automatic-Recommended`

API`s anchors:

- Link to the "Properties" section in the API - `NgDocBaseInput#Properties`
- Link to the specific property in the API - `NgDocBaseInput.ngControl`
- Link to the specific parameter of the constructor in the
  API - `NgDocInputStringDirective.elementRef`
- Link to the getter in the API - `NgDocBaseInput.get-disabled`
- Link to the setter in the API - `NgDocBaseInput.set-disabled`
- Link to the method in the API - `NgDocBaseInput.focus`
```

Guide`s anchors:

- Link to the section in guides - `*GettingStartedInstallation#Manual`
- Link to the section in guides - `*GettingStartedInstallation#Automatic-Recommended`

API`s anchors:

- Link to the "Properties" section in the API - `NgDocBaseInput#Properties`
- Link to the specific property in the API - `NgDocBaseInput.ngControl`
- Link to the specific parameter of the constructor in the
  API - `NgDocInputStringDirective.elementRef`
- Link to the getter in the API - `NgDocBaseInput.get-disabled`
- Link to the setter in the API - `NgDocBaseInput.set-disabled`
- Link to the method in the API - `NgDocBaseInput.focus`
