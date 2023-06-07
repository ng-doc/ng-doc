# {{ NgDocPage.title }}

Keywords loaders is a lazy way to load your global keywords.
It can be used to load keywords from external APIs or from the local file system.

## Creating a keywords loader

To create a keywords loader, you need to create a function that returns a
`NgDocKeywordsLoader` function. This function is responsible for loading the
keywords.

```typescript
import {NgDocKeywordsLoader} from '@ng-doc/core';

export function myKeywordsLoader(): NgDocKeywordsLoader {
  return async (keywords: string[]) => {
    return Promise.resolve({
      googleKeyword: {
        title: 'Google',
        url: 'https://google.com',
      },
    });
  };
}
```

After that, you need to add the loader to the `keywordsLoaders` array in the
`ng-doc.config.ts` file:

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';
import {myKeywordsLoader} from './my-keywords-loader';

const config: NgDocConfiguration = {
  keywordsLoaders: [myKeywordsLoader()],
};
```

And that's it! Now, when you run your app, all your usages of the `googleKeyword`
keyword, will be converted to links to the Google website.

```markdown fileName="index.md"
Check this out: `googleKeyword`.
```

## Prebuilt loaders

NgDoc provides a simple way to integrate your documentation with external APIs.
This is useful if you want to make your documentation more user-friendly by
providing links to the API documentation of external libraries. The
API integration is done by providing a special `NgDocKeywordsLoader` to the
`ng-doc.config.ts` file.

### Installing the loaders

NgDoc provides a few loaders out of the box. You can install them by running:

```bash
npm i @ng-doc/keywords-loaders --save-dev
```

### Integrating with the Angular documentation

To integrate your documentation with the Angular documentation, you need to open
your `ng-doc.config.ts` file, and import `ngKeywordsLoader` from to the `keywordsLoaders` array:

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';
import {ngKeywordsLoader} from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywordsLoaders: [ngKeywordsLoader()],
};

export default config;
```

After that, when you run your app, all your usages of Angular keywords, in code blocks and inline
code, will be converted to links to the Angular documentation.

```markdown fileName="index.md"
Check this out: `Component` or `@Component`.
```

Check this out: `Component` or `@Component`.
