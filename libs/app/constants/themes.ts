import { NgDocTheme } from '@ng-doc/app/interfaces';

/**
 * Dark theme. You can set it manually by calling `NgDocThemeService.set` method.
 *
 * ```typescript
 * import {Component} from '@angular/core';
 * import {NgDocThemeService, NG_DOC_NIGHT_THEME} from '@ng-doc/app';
 *
 * @Component()
 * export class AppComponent {
 * 	constructor(
 * 	    private readonly themeService: NgDocThemeService,
 * 	) {
 * 	    this.themeService.setTheme(NG_DOC_NIGHT_THEME.id);
 * 	}
 * }
 * ```
 *
 * Or you can set it as default theme in your app module:
 * ```typescript
 * import {NgModule} from '@angular/core';
 * import {NgDocModule, NG_DOC_NIGHT_THEME} from '@ng-doc/app';
 * import {AppComponent} from './app.component';
 *
 * @NgModule({
 * 	declarations: [AppComponent],
 * 	imports: [NgDocModule.forRoot({defaultTheme: NG_DOC_NIGHT_THEME.id})],
 * 	bootstrap: [AppComponent],
 * })
 * export class AppModule {}
 * ```
 */
export const NG_DOC_NIGHT_THEME: NgDocTheme = {
	id: 'ng-doc-night',
	path: 'assets/ng-doc/app/themes/ng-doc-night.css',
};

/**
 * Dark purple theme. You can set it manually by calling `NgDocThemeService.set` method.
 *
 * ```typescript
 * import {Component} from '@angular/core';
 * import {NgDocThemeService, NG_DOC_DARK_PURPLE_THEME} from '@ng-doc/app';
 *
 * @Component()
 * export class AppComponent {
 * 	constructor(
 * 	    private readonly themeService: NgDocThemeService,
 * 	) {
 * 	    this.themeService.setTheme(NG_DOC_DARK_PURPLE_THEME.id);
 * 	}
 * }
 * ```
 *
 * Or you can set it as default theme in your app module:
 * ```typescript
 * import {NgModule} from '@angular/core';
 * import {NgDocModule, NG_DOC_DARK_PURPLE_THEME} from '@ng-doc/app';
 * import {AppComponent} from './app.component';
 *
 * @NgModule({
 * 	declarations: [AppComponent],
 * 	imports: [NgDocModule.forRoot({defaultTheme: NG_DOC_DARK_PURPLE_THEME.id})],
 * 	bootstrap: [AppComponent],
 * })
 * export class AppModule {}
 * ```
 */
export const NG_DOC_DARK_PURPLE_THEME: NgDocTheme = {
	id: 'ng-doc-dark-purple',
	path: 'assets/ng-doc/app/themes/ng-doc-dark-purple.css',
};
