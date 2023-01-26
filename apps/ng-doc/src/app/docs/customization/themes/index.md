# {{ NgDocPage.title }}

This article only scratches the surface of theme creation, we won't dive into the details of all the
variables in it as this is just a beta version of the library, when its API stabilizes we'll cover
theme creation in more detail.

## How to create your own theme

Themes in NgDoc are regular CSS files that override CSS variables, in order to create your own theme
you need to create a theme file.

For example, create a `custom-theme.css` file in the `assets/themes` folder of your documentation
project.

> **Note**
> You can also use SASS or LESS, but then you will need to compile it to CSS before running the
> application

> **Note**
> The theme file must be in the `assets` directory so that NgDoc can dynamically load it when
> necessary.

### Registering a theme

Once you have created a theme file, you need to register it, you can do this by passing a list of
your themes to the `forRoot` method of the `NgDocModule` module

Your theme value must match the `NgDocTheme` interface.

```typescript
import {NgModule} from '@angular/core';
import {NgDocModule} from '@ng-doc/app';
import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [
		NgDocModule.forRoot({
			themes: [
				{
					// Your theme ID that you can use to enable theme
					id: 'custom-theme',
					// Path to the theme, that will be used by NgDoc to load theme
					path: 'assets/themes/custom-theme.css',
				},
			],
		}),
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
```

### Theme content

A theme is just a set of overridden CSS variables that NgDoc uses, for example, our `night` theme
looks like this, which allows you to enable dark mode.

```scss
{% include "../../../../../../../libs/app/styles/themes/ng-doc-night.scss" %}
```

## Switching themes

Once you have created your theme, you can use `NgDocThemeService` to apply it to your application.
Just put your theme id to the `set` method.

```typescript
import {NgDocThemeService} from '@ng-doc/app';

@Component({})
export class AppComponent {
	constructor(protected readonly themeService: NgDocThemeService) {}

	setTheme(): void {
		this.themeService.set('custom-theme');
	}
}
```

## Theme by default

If you don't need the functionality to switch themes on the fly and would like to set a default
theme, then you can do this by passing a theme id to the `forRoot` method of the `NgDocModule`
module

```typescript
import {NgModule} from '@angular/core';
import {NgDocModule} from '@ng-doc/app';
import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [NgDocModule.forRoot({defaultTheme: 'custom-theme'})],
	bootstrap: [AppComponent],
})
export class AppModule {}
```

## Themes out of the box

NgDoc comes with two themes, a main light theme and an additional dark theme.

The light theme is set by default and has no `id`, while the dark theme is optional and can be
loaded using the `NgDocThemeService` service, or set by default using the `defaultTheme` field in
the `forRoot` method of the module ` NgDocModule`, you can get its id by
importing `NG_DOC_NIGHT_THEME`
variable.

For example, you can set the dark theme by default as follows

```typescript
import {NgModule} from '@angular/core';
import {NgDocModule, NG_DOC_NIGHT_THEME} from '@ng-doc/app';
import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [NgDocModule.forRoot({defaultTheme: NG_DOC_NIGHT_THEME.id})],
	bootstrap: [AppComponent],
})
export class AppModule {}
```

## Code highlighting

We use the `highlightjs` library for code highlighting, it has a lot of ready-made themes, and if
you want to use a different code theme for your NgDoc theme, then you can simply import the code theme file
from the `highlightjs` library into your theme file.

> **Note**
> To include one CSS file in another, you will need to use SASS or LESS, and the import must be
> relative and not contain an extension, read more [here](https://sass-lang.com/blog/feature-watchcss-imports-and-css-compatibility)

For example like this

```scss
// theme.scss

@import '../../../../../node_modules/highlight.js/styles/agate';

:root {
	// My custom theme implementation
}
```
