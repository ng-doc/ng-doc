---
keyword: CodeHighlightingPage
---

NgDoc colors code with Shiki. Code blocks in your pages are highlighted when NgDoc builds them, and
the code of a playground, which changes while readers edit its inputs, is highlighted in the
browser. Both use the same pair of themes: one for light backgrounds and one for dark ones.

## 👀 See it

Built with the new engine, this site colors its code with the default theme. Switch between the
light and dark themes with the `T` key and watch the colors follow:

```typescript name="theme-toggle.ts"
import { Component, inject } from '@angular/core';
import { NgDocThemeService } from '@ng-doc/app';

/** Switches the site between the light and the dark theme. */
@Component({
  selector: 'app-theme-toggle',
  template: `<button type="button" (click)="toggle()">Toggle</button>`,
})
export class ThemeToggleComponent {
  private readonly themeService = inject(NgDocThemeService);

  protected toggle(): void {
    this.themeService.set(this.themeService.theme() === 'dark' ? undefined : 'dark');
  }
}
```

## The default theme

With the new engine (the Vite host and the `ng-doc` CLI), code is colored by NgDoc's own
theme, `css-variables`. Its name is exported as `NG_DOC_SYNTAX_THEME_NAME`, and `ngDocSyntaxTheme()`
creates it. Every color of the theme is a CSS variable, `var(--ng-doc-syntax-*)`, and its
background is `--ng-doc-code-background`. So code follows the light, dark and custom themes of the
site without being highlighted again, and you change its colors with CSS.

The legacy `application` and `dev-server` builders keep the `github-light` and `ayu-dark` Shiki
themes. To use the default theme with them, set it as both themes in `ng-doc.config.ts`:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  shiki: {
    themes: {
      light: 'css-variables',
      dark: 'css-variables',
    },
  },
};

export default config;
```

## Change colors

Override the `--ng-doc-syntax-*` variables in your global styles, after the NgDoc styles:

```css name="styles.css"
:root {
  --ng-doc-syntax-keyword: #8250df;
  --ng-doc-syntax-type: #0550ae;
  --ng-doc-syntax-function: #116329;
  --ng-doc-syntax-string: #0a3069;
}

:root[data-theme='dark'] {
  --ng-doc-syntax-keyword: #d2a8ff;
  --ng-doc-syntax-type: #79c0ff;
  --ng-doc-syntax-function: #7ee787;
  --ng-doc-syntax-string: #a5d6ff;
}

@media (prefers-color-scheme: dark) {
  :root[data-theme='auto'] {
    --ng-doc-syntax-keyword: #d2a8ff;
    --ng-doc-syntax-type: #79c0ff;
    --ng-doc-syntax-function: #7ee787;
    --ng-doc-syntax-string: #a5d6ff;
  }
}
```

The defaults are mixed from the main colors of the site, so a change of `--ng-doc-primary`,
`--ng-doc-success` or `--ng-doc-warning` recolors code too, and the dark theme needs no syntax
variables of its own. Set dark values only when you set light ones.

### Variables

| Variable                      | Default                                                   | Colors                                                                           |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `--ng-doc-syntax-plain`       | `--ng-doc-text`                                           | Text that no other rule colors, and code inside a template literal's `${…}`.     |
| `--ng-doc-syntax-punctuation` | `--ng-doc-text`                                           | Punctuation, braces, operators and the angle brackets of HTML tags.              |
| `--ng-doc-syntax-comment`     | `--ng-doc-text-muted`                                     | Comments, in italics.                                                            |
| `--ng-doc-syntax-keyword`     | `--ng-doc-hue-violet` mixed with `--ng-doc-heading-color` | Keywords such as `const`, `class`, `new` and `this`, and Markdown headings.      |
| `--ng-doc-syntax-type`        | `--ng-doc-primary` mixed with `--ng-doc-heading-color`    | Names of types, classes and namespaces, built-in types, and links in Markdown.   |
| `--ng-doc-syntax-function`    | `--ng-doc-success` mixed with `--ng-doc-heading-color`    | Function names and calls, and HTML attribute names.                              |
| `--ng-doc-syntax-string`      | `--ng-doc-warning` mixed with `--ng-doc-heading-color`    | Strings, and inline code in Markdown.                                            |
| `--ng-doc-syntax-number`      | `--ng-doc-syntax-string`                                  | Numbers and constants, such as `true`, `false` and `null`.                       |
| `--ng-doc-syntax-tag`         | `--ng-doc-syntax-type`                                    | HTML tags and component selectors.                                               |
| `--ng-doc-syntax-decorator`   | `--ng-doc-syntax-keyword`                                 | The `@` and the name of a decorator. Its arguments keep their own colors.        |
| `--ng-doc-mix-syntax`         | `80%`                                                     | How much of its hue a mixed default takes. The rest is `--ng-doc-heading-color`. |
| `--ng-doc-code-background`    | `--ng-doc-base-1`                                         | The background of code blocks. The theme uses it as its background.              |

## Use another Shiki theme

To color code with themes that are bundled with Shiki, such as `github-light` and `github-dark`,
set them in three places.

1. Name the themes in `ng-doc.config.ts`. NgDoc highlights your pages with them:

   ```typescript name="ng-doc.config.ts"
   import { NgDocConfiguration } from '@ng-doc/builder';

   const config: NgDocConfiguration = {
     shiki: {
       themes: {
         light: 'github-light',
         dark: 'github-dark',
       },
     },
   };

   export default config;
   ```

2. Load them in the browser, where NgDoc highlights the code of playgrounds with the same theme
   names. `provideNgDocApp` loads `github-light`, `ayu-dark` and `css-variables` already; pass the
   others to `shiki.themes`. Its `shiki.theme` field is deprecated and has no effect, so name the
   themes only in `ng-doc.config.ts`:

   ```typescript name="app.config.ts"
   import { ApplicationConfig } from '@angular/core';
   import { provideNgDocApp } from '@ng-doc/app';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideNgDocApp({
         shiki: { themes: [import('shiki/themes/github-dark.mjs')] },
       }),
     ],
   };
   ```

3. With the Vite plugin, map each of these themes to its module in `themeModules`, so Vite can
   prebundle it (`*BuildersReference#vite-plugin`):

   ```javascript name="vite.config.mjs"
   createNgDocVitePlugin({
     // ...the other options
     themeModules: { 'github-dark': 'shiki/themes/github-dark.mjs' },
   });
   ```

   Without it, the build fails with `NGDOC_VITE_THEME_MODULE`.

In the dark theme, and in the auto theme when the reader's system prefers dark, NgDoc switches code
blocks to the colors of the dark theme. Code keeps the colors that the Shiki theme gives it: the
`--ng-doc-syntax-*` variables have no effect.

### Use the theme in your own code

`ngDocSyntaxTheme()` returns the default theme as a Shiki theme object. Load it into your own Shiki
highlighter to color code outside of NgDoc's code blocks the same way:

```typescript name="highlight.ts"
import { NG_DOC_SYNTAX_THEME_NAME, ngDocSyntaxTheme } from '@ng-doc/core';
import { createHighlighter } from 'shiki';

const highlighter = await createHighlighter({
  themes: [ngDocSyntaxTheme()],
  langs: ['typescript'],
});

const html = highlighter.codeToHtml('const answer = 42;', {
  lang: 'typescript',
  theme: NG_DOC_SYNTAX_THEME_NAME,
});
```

Call `ngDocSyntaxTheme()` for every highlighter: Shiki changes the theme object that it loads.

## Add languages

Code blocks can use every language bundled with Shiki. To highlight a language that Shiki doesn't
bundle, or to replace a bundled grammar with another one, register it in `shiki.langs` of
`ng-doc.config.ts`. A registration is a TextMate grammar with a `name`, which code blocks use, and a
`scopeName`. Import it from a `.tmLanguage.json` file or from `@shikijs/langs`:

```typescript name="ng-doc.config.ts" {2,10}
import { NgDocConfiguration } from '@ng-doc/builder';
import myLanguage from './my-language.tmLanguage.json';

const config: NgDocConfiguration = {
  shiki: {
    themes: {
      light: 'css-variables',
      dark: 'css-variables',
    },
    langs: [myLanguage],
  },
};

export default config;
```

A code block that names the language, such as ` ```my-language `, is then highlighted with it. A
registration named like a bundled language, `html` for example, replaces it, also where other
grammars embed it. Only the new engine reads `shiki.langs`.

The browser highlights playground code, which is Angular HTML, with the `angular-html` grammar and
the grammars it embeds. To change them there too, pass the same registrations to `provideNgDocApp`:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideNgDocApp } from '@ng-doc/app';

import angularHtml from './angular-html.tmLanguage.json';

export const appConfig: ApplicationConfig = {
  providers: [provideNgDocApp({ shiki: { langs: [angularHtml] } })],
};
```

## 🚧 Gotchas

> **Note**
> A registration of `shiki.langs` must be plain JSON data: a function or a promise, such as
> `() => import('./grammar.json')`, fails the build with `DISCOVERY_SHIKI_LANGUAGE_INVALID`. The
> languages that a grammar embeds (`embeddedLangs`) must be bundled with Shiki or registered too,
> or every page fails to build.

> **Note**
> NgDoc highlights code with Shiki 4, which knows Angular's `@let` and every control flow block.
> Themes and languages that you load yourself must be Shiki 4 registrations. Shiki writes the font
> styles of a pair of themes as the `--shiki-light-font-style` and `--shiki-dark-font-style`
> variables (and their `font-weight` and `text-decoration` siblings), which the NgDoc styles apply
> to code blocks.

> **Warning**
> The theme names in `shiki.themes` must be themes bundled with Shiki, or `css-variables`. To use
> a theme of your own, set its colors with the `--ng-doc-syntax-*` variables instead.

> **Note**
> A dark custom theme of the site needs an extra rule when code uses a pair of Shiki themes: see
> `*ThemesAndColorsPage#custom-theme`. With the default theme, set the `--ng-doc-syntax-*`
> variables in your theme instead.

{% index false %}

## Related

- `*ThemesAndColorsPage`
- `*CodeBlocksPage`
- `*ConfigurationReference`

{% endindex %}

Next: `*IconsPage`
