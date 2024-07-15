---
keyword: 'FeaturesKeywordsLoaders'
---

Keywords loaders it's a way to lazy-load your global keywords.
It can be used to load keywords from external APIs or from the local file system.

## Prebuilt loaders

NgDoc provides a simple intergration your documentation with external APIs.
This is useful if you want to make your documentation more user-friendly by
providing links to the API documentation of third-party libraries. The
API integration is done by providing a special `NgDocKeywordsLoader` to the
`ng-doc.config.ts` file.

To use loaders below you need to install them:

```bash
npm i @ng-doc/keywords-loaders --save-dev
```

### Integrating with the Angular documentation

> **Note**
> This loader integrates only API, it doesn't integrate the Angular guides, tutorials, etc.
> It also has some options for configuring, e.g. you can specify the version of the Angular
> documentation.

To integrate your documentation with the Angular documentation, you need to open
your `ng-doc.config.ts` file, and import `ngKeywordsLoader` to the `keywordsLoaders` array:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { ngKeywordsLoader } from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [ngKeywordsLoader()],
  },
};

export default config;
```

After that, when you run your app, all your usages of Angular keywords, in code blocks and inline
code, will be converted to links to the Angular documentation.

```markdown name="index.md"
Check this out: `Component` or `@Component` or `ChangeDetectorRef`.
```

Check this out: `Component` or `@Component` or `ChangeDetectorRef`.

### Integration with third-party NgDoc documentations

To integrate your documentation with third-party NgDoc documentation, you need to open
your `ng-doc.config.ts` file, and import `ngDocKeywordsLoader` to the `keywordsLoaders` array
and provide the base config:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { ngDocKeywordsLoader } from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [
      ngDocKeywordsLoader({
        endpoint: 'https://ng-doc.com',
      }),
    ],
  },
};

export default config;
```

After that, NgDoc will try to load the keywords everytime when you start your app,
and they should be available in your documentation. And yes, if the third-party documentation
has changed its content and some keywords that you use are not available anymore, you will get a
warning in the console.

You can also integrate guides of the third-party documentation, and provide a prefix if
you want not to conflict with your own guides keywords:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { ngDocKeywordsLoader } from '@ng-doc/keywords-loaders';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [
      ngDocKeywordsLoader({
        endpoint: 'https://ng-doc.com',
        loadGuides: true,
        guidesPrefix: 'ExtraDoc',
      }),
    ],
  },
};

export default config;
```

After that, you should be able to use the keywords from the third-party NgDoc documentation,
the anchors are also supported:

```markdown name="index.md"
Check this link: `*ExtraDocGettingStartedInstallation`.
Or this one with anchor: `*ExtraDocGettingStartedInstallation#Manual`.
```

## Creating a keywords loader

To create your own keywords loader, you need to create a function that returns a
`NgDocKeywordsLoader` function. This function is responsible for loading the
keywords.

```typescript
import { NgDocKeywordsLoader } from '@ng-doc/core';

export function myKeywordsLoader(): NgDocKeywordsLoader {
  return async () => {
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

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';
import { myKeywordsLoader } from './my-keywords-loader';

const config: NgDocConfiguration = {
  keywords: {
    loaders: [myKeywordsLoader()],
  },
};
```

And that's it! Now, when you run your app, all your usages of the `googleKeyword`
keyword, will be converted to links to the Google website.

```markdown name="index.md"
Check this out: `googleKeyword`.
```
