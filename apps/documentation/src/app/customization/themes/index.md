# {{ NgDocPage.title }}

This article only scratches the surface of theme creation, we won't dive into the details of all the
variables in it as this is just a beta version of the library, when its API stabilizes we'll cover
theme creation in more detail.

## How to create you own theme

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

Once you have created a theme file, you need to register it, to do this open your `app.module.ts`
and add a new provider to it as shown in the example below.

Your theme value must match the `NgDocTheme` interface.

```typescript
import {NgModule} from '@angular/core';
import {NG_DOC_THEME} from '@ng-doc/app';
import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [],
	providers: [{
		provide: NG_DOC_THEME,
		useValue: {
			// Your theme ID that you can use to enable theme
			id: 'custom-theme',
			// Path to the theme, that will be used by NgDoc to load theme
			path: 'assets/themes/custom-theme.css'
		},
		multi: true
	}],
	bootstrap: [AppComponent],
})
export class AppModule {
}
```

### Theme content

A theme is just a set of overridden CSS variables that NgDoc uses, for example, our `night` theme
looks like this, which allows you to enable dark mode.

```scss
{% include "../../../../../../libs/app/styles/themes/ng-doc-night.scss" %}
```

## Switching themes

Once you have created your theme, you can use `NgDocThemeService` to apply it to your application.
Just put your theme id to the `set` method.

```typescript
import {NgDocThemeService} from '@ng-doc/app';

@Component({})
export class AppComponent {
	constructor(protected readonly themeService: NgDocThemeService) {
	}

	setTheme(): void {
		this.themeService.set('custom-theme');
	}
}
```

## Theme by default

If you don't need the functionality to switch themes on the fly and would like to set a default
theme, then you can provide the theme id in your `AppModule` using the `NG_DOC_DEFAULT_THEME_ID`
token.

```typescript
import {NgModule} from '@angular/core';
import {NG_DOC_DEFAULT_THEME_ID} from '@ng-doc/app';
import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [],
	providers: [{
		provide: NG_DOC_DEFAULT_THEME_ID,
		useValue: 'custom-theme',
		multi: true,
	}],
	bootstrap: [AppComponent],
})
export class AppModule {
}
```
