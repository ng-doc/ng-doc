---
keyword: 'CustomizationThemes'
---

To style your documentation project, NgDoc provides a theming system that allows you to create your
own themes or use one of the themes that come out of the box.

By default, NgDoc has 2 themes, dark and light. You can override them or add your own.

We use CSS variables for theming, so you need to create a CSS file that will override the theme
variables.

## Overriding theme variables

You can override any CSS variable that is used in the NgDoc application.
For example, below is a list of variables that are used in the light theme. they are used
for backgrounds, borders etc.

```css
:root {
  --ng-doc-base-0: var(--ng-doc-white);
  --ng-doc-base-1: #f6f6f6;
  --ng-doc-base-2: #ebebeb;
  --ng-doc-base-3: #dedede;
  --ng-doc-base-4: #d1d1d1;
  --ng-doc-base-5: #b8b8b8;
  --ng-doc-base-6: #ababab;
  --ng-doc-base-7: #9e9e9e;
  --ng-doc-base-8: #919191;
  --ng-doc-base-9: #858585;
  --ng-doc-base-10: #6e6e6e;
}
```

## Dark mode

NgDoc has a dark mode theme that you can enable by importing the `dark.css` file from the
`@ng-doc/app` package.

```scss name="styles.scss"
@import '@ng-doc/app/styles/themes/dark.css';
```

## Auto theme

NgDoc can also switch themes automatically based on the user's OS settings. To enable it, you
can call the `set` method of the `NgDocThemeService` service with the `auto` value.

```typescript name="main.ts" {7}
@Component({})
export class AppComponent {
  constructor(protected readonly themeService: NgDocThemeService) {}

  setTheme(): void {
    this.themeService.set('auto');
  }
}
```

## Theme by default

In order to set the default theme, you need to add the `data-theme` attribute to the `html` element
in the `index.html` file.

```html name="index.html" {8}
<!doctype html>
<html lang="en" data-theme="dark">
  <head> </head>
  <body></body>
</html>
```

## Code highlighting theme

NgDoc uses the `shiki` library for code highlighting, it has a lot of ready-made themes, and if
you want to use a different code theme for your NgDoc theme, then you can simply configure it.

First, you need to provide the themes in the `ng-doc.config.ts` file to make them available for
the builder.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  shiki: {
    themes: {
      dark: 'material-theme-darker',
      light: 'material-theme-lighter',
    },
  },
};
```

And as a last step, you need to import and configure them on the client side in the `main.ts` file.

```typescript name="main.ts"
import { bootstrapApplication } from '@angular/platform-browser';
import { provideNgDocApp } from '@ng-doc/app';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideNgDocApp({
      shiki: {
        themes: [
          import('shiki/themes/material-theme-darker.mjs'),
          import('shiki/themes/material-theme-lighter.mjs'),
        ],
        theme: {
          dark: 'material-theme-darker',
          light: 'material-theme-lighter',
        },
      },
    }),
  ],
}).catch((err: unknown) => console.error(err));
```

## Custom theme

Let's say you decided to create your own theme and named it `my-theme`. You need to create a CSS
file that will override the theme variables.

When you enable your theme, NgDoc will set `data-theme="my-theme"` on the `html` element. So you
need to use this attribute in you theme too.

For example, look at the `dark.scss` file that is used for the dark theme.

```scss file="../../../../../libs/app/styles/themes/dark.scss" name="dark.scss"

```
