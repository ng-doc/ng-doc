---
keyword: ThemesAndColorsPage
---

NgDoc styles every part of the site with CSS variables. A theme is a set of values for these
variables, chosen by the `data-theme` attribute of the `<html>` element. NgDoc ships a light, a
dark and an auto theme, and you can change any variable or add your own theme.

## Themes

| Theme | `data-theme` | Colors                                                   |
| ----- | ------------ | -------------------------------------------------------- |
| Light | (none)       | The default values.                                      |
| Dark  | `dark`       | The dark values.                                         |
| Auto  | `auto`       | Light or dark, following the reader's system preference. |

The light theme is part of the NgDoc styles. The dark and auto themes are in a separate stylesheet:
add it after the NgDoc styles in the `build` target.

```json group="dark" name="Angular CLI (angular.json)" icon="angular"
{
  "projects": {
    "<project-name>": {
      "architect": {
        "build": {
          "options": {
            "styles": ["node_modules/@ng-doc/app/styles/global.css", "node_modules/@ng-doc/app/styles/themes/dark.css", "src/styles.css"]
          }
        }
      }
    }
  }
}
```

```json group="dark" name="Nx (project.json)" icon="nx"
{
  "targets": {
    "build": {
      "options": {
        "styles": ["node_modules/@ng-doc/app/styles/global.css", "node_modules/@ng-doc/app/styles/themes/dark.css", "src/styles.css"]
      }
    }
  }
}
```

Readers switch the theme with `ng-doc-theme-toggle`, which cycles through Auto, Light and Dark
(`*LayoutPage#navbar`), or with the `T` key, which switches between light and dark
(`*SearchPage#keyboard-shortcuts`). NgDoc saves the choice in the browser and restores it before
the application starts, so the page doesn't flash in the wrong theme.

## Theme by default

Without a `data-theme` attribute, the site starts in the light theme. To start in another theme, set
the attribute in `index.html`:

```html name="index.html" {2}
<!doctype html>
<html lang="en" data-theme="auto">
  <head></head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

## Change colors

Override the variables in your global styles, after the NgDoc styles. A rule on `:root` changes the
light theme; add a rule for `[data-theme='dark']` to change the dark theme too:

```css name="styles.css"
:root {
  --ng-doc-primary: #7c3aed;
  --ng-doc-font-family: 'Inter', sans-serif;
}

:root[data-theme='dark'] {
  --ng-doc-primary: #a78bfa;
}

@media (prefers-color-scheme: dark) {
  :root[data-theme='auto'] {
    --ng-doc-primary: #a78bfa;
  }
}
```

The auto theme uses the dark values inside `prefers-color-scheme: dark`, so repeat your dark
overrides there.

Tints, borders, focus rings and badges are mixed from the main colors, so they follow your
overrides. For example, the background of a selected search result is a tint of
`--ng-doc-primary`.

### Main variables

| Variable                                        | Description                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `--ng-doc-base-0` to `--ng-doc-base-10`         | The neutral ramp. `base-0` is the page background, and each step moves further from it. |
| `--ng-doc-background`                           | The page background. `--ng-doc-base-0` by default.                                      |
| `--ng-doc-text`                                 | Body text.                                                                              |
| `--ng-doc-text-muted`                           | Secondary text, such as descriptions and hints.                                         |
| `--ng-doc-heading-color`                        | Headings and emphasized text.                                                           |
| `--ng-doc-link-color`                           | Links. `--ng-doc-primary` by default.                                                   |
| `--ng-doc-border-color`                         | Borders and dividers.                                                                   |
| `--ng-doc-primary`                              | The accent color: active items, buttons and focus.                                      |
| `--ng-doc-info`, `--ng-doc-success`             | The colors of the note and success callouts.                                            |
| `--ng-doc-warning`, `--ng-doc-alert`            | The colors of the warning and alert callouts.                                           |
| `--ng-doc-primary-text` and the other `-text`   | Text on a solid fill of that color, such as `--ng-doc-alert-text`.                      |
| `--ng-doc-font-family`                          | The body font.                                                                          |
| `--ng-doc-heading-font-family`                  | The heading font.                                                                       |
| `--ng-doc-font-size`                            | The body font size.                                                                     |
| `--ng-doc-code-font`                            | The code font.                                                                          |
| `--ng-doc-code-background`                      | The background of code blocks.                                                          |
| `--ng-doc-inline-code-background`               | The color that inline code is tinted with.                                              |
| `--ng-doc-shadow-color`                         | The color of every shadow.                                                              |
| `--ng-doc-class-background` and the other kinds | The hue of an API kind, such as a class or an interface.                                |

The sizes of the navbar, the sidebar and the page are in `*LayoutPage#sizes-and-colors`. Some pages
describe the variables of their components, such as `*DemosPage#customization`.

### Tokens

The default values come from a token layer in `@ng-doc/ui-kit`: palettes such as
`--ng-doc-palette-brand-600`, spacing (`--ng-doc-space-4`), radii (`--ng-doc-radius-md`) and type
sizes. You can use the tokens in your own styles to match NgDoc. Prefer overriding the variables
above to overriding tokens, because the variables are what the components read.

## 🎨 Custom theme

A custom theme is a stylesheet scoped to its own `data-theme` value. Start from the dark theme,
which overrides only what differs from the light values:

```scss file="../../../../../libs/app/styles/themes/dark.scss" name="dark.scss"

```

For a theme called `ocean`, add the rules to your global styles:

```css name="styles.css"
:root[data-theme='ocean'] {
  --ng-doc-base-0: #0b1f2a;
  --ng-doc-base-1: #102a38;
  --ng-doc-heading-color: #e6f4f8;
  --ng-doc-text: #c2dde6;
  --ng-doc-primary: #38bdf8;
}

/* Code blocks: use the dark colors of the code theme */
:root[data-theme='ocean'] .shiki,
:root[data-theme='ocean'] .shiki span {
  color: var(--shiki-dark) !important;
}
```

The last rule is needed only for a dark custom theme whose code blocks use a pair of Shiki themes
(the legacy builders, or `shiki.themes` in the configuration): code blocks use the light colors of
the code theme unless the theme is `dark` or `auto`. With the default `css-variables` code theme,
set `--ng-doc-syntax-*` in your theme instead.

Switch to it with `NgDocThemeService`, or set it by default in `index.html`:

```typescript name="theme-button.component.ts"
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgDocThemeService } from '@ng-doc/app/services/theme';

@Component({
  selector: 'app-theme-button',
  template: ` <button type="button" [attr.aria-pressed]="isOcean()" (click)="toggle()">Ocean theme</button> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeButtonComponent {
  private readonly themeService = inject(NgDocThemeService);

  protected readonly isOcean = computed(() => this.themeService.theme() === 'ocean');

  protected toggle(): void {
    this.themeService.set(this.isOcean() ? 'auto' : 'ocean');
  }
}
```

`theme()` is the current theme as a signal: `auto`, `dark`, the id of your theme, or `null` for the
light theme. `set()` changes it and saves it in the browser; `set()` without an id switches to the
light theme.

## Code highlighting

With the Vite plugin, the `modern-*` builders and the `ng-doc` CLI, code is colored by NgDoc's
`css-variables` theme by default: every token takes a CSS variable of the current site theme, so
code follows the light, dark and custom themes. Override the variables like the others:

```css name="styles.css"
:root {
  --ng-doc-syntax-keyword: #8250df;
  --ng-doc-syntax-type: #0550ae;
  --ng-doc-syntax-function: #116329;
  --ng-doc-syntax-string: #0a3069;
}
```

The variables are `--ng-doc-syntax-plain`, `-punctuation`, `-comment`, `-keyword`, `-type`,
`-function`, `-string`, `-number`, `-tag` and `-decorator`. The legacy `application` and
`dev-server` builders keep the `github-light` and `ayu-dark` Shiki themes unless you set
`css-variables` as both themes. To use other Shiki themes, see `*CodeHighlightingPage`.

## 🚧 Gotchas

> **Warning**
> The `ng-doc-theme-toggle` component offers only Auto, Light and Dark. While a custom theme is set, it shows
> Auto, and pressing it leaves your theme. Give readers your own control for a custom theme.

<ng-doc-blockquote type="note" label="💡 Tip">

Override variables in a global stylesheet. A rule in a component's styles is scoped to that
component and doesn't reach NgDoc.

</ng-doc-blockquote>

{% index false %}

## Related

- `*LayoutPage`
- `*CodeHighlightingPage`
- `*UpgradeTo22Page#4-theme-and-css`

{% endindex %}

Next: `*CodeHighlightingPage`
