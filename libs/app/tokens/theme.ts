import {InjectionToken} from '@angular/core';
import {NgDocTheme} from '@ng-doc/app/interfaces';

/**
 * Token that can be used to provide custom theme.
 * You must compile your theme to CSS and add it to `assets` so that NgDoc can load it dynamically.
 *
 * You always should provide custom themes in root of your application with `multi: true` parameter.
 *
 * For example
 * ```typescript
 * @NgModule({
 * 	declarations: [AppComponent],
 * 	imports: [],
 * 	providers: [
 * 	    {provide: NG_DOC_THEME, useValue: {id: 'CustomTheme', path: '/assets/themes/custom.css'}, multi: true}
 * 	],
 * 	bootstrap: [AppComponent],
 * })
 * export class AppModule {}
 * ```
 */
export const NG_DOC_THEME: InjectionToken<NgDocTheme> = new InjectionToken<NgDocTheme>(`NG_DOC_THEME`);

/**
 * Default theme for application if user didn't change it manually.
 *
 * You can provide this token in the root of you application, to set theme by default.
 */
export const NG_DOC_DEFAULT_THEME: InjectionToken<NgDocTheme> = new InjectionToken<NgDocTheme>(`NG_DOC_DEFAULT_THEME`);
