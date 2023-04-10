# {{ NgDocPage.title }}

This section describes how you can configure certain functions of the library.

## Configuration file

The main library configuration can be done in `ng-doc.config.ts` configuration file, it should be
exported by default and match `NgDocConfiguration` interface.

> **Note** You can create a configuration file in the root of your repository or in the root of the
> documentation application.

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';

const config: NgDocConfiguration = {
	// ...
};

export default config;
```

## Configuring repository

If you are creating an open source project and would like to receive suggestions for improving the
documentation from your users, then the best way is to make this process easier for them, you can do
this by adding a "Suggest edits" and "View Source" buttons to each page, for this
specify `repoConfig` that should match `NgDocRepoConfig` interface in your `ng-doc.config.ts` file.

After that, NgDoc will start displaying links for editing and viewing the source code of the page.

> **Note**
> NgDoc supports only GitHub repositories, you can ask for support for other repositories by
> creating an issue in our `ngDocFeatureRequest` page.

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';

const config: NgDocConfiguration = {
	repoConfig: {
		url: 'https://github.com/skoropadas/ng-doc',
		mainBranch: 'main',
		releaseBranch: 'release',
	},
};

export default config;
```

## Documentation route

By default, the documentation is located at the root of the application router and has routes
like `localhost:4200/getting-started`, but sometimes you may need to move it to a different route
to display other pages of the application as a landing page or something like that.

To do this, you need to create a separate component and module with routing that will be responsible
for displaying the documentation, for example:

### Module

As far as you can see, we just moved the import of NgDoc modules from `AppModule` to a
new `DocsModule`
and made it a child, in the future we will also do lazy loading so as not to load dependencies that
other pages do not need.

```typescript fileName="docs.module.ts"
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/generated';
import {DocsComponent} from './docs.component';
import {NgDocNavbarModule} from '@ng-doc/app/components/navbar';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';

@NgModule({
	imports: [
		CommonModule,
		NgDocNavbarModule,
		NgDocSidebarModule,
		NgDocModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forChild([
			{
				path: '',
				children: NG_DOC_ROUTING,
			},
		]),
	],
	declarations: [DocsComponent],
	exports: [RouterModule],
})
export class DocsModule {}
```

### Component

Same for the component, we just move the content that NgDoc adds by default to `AppComponent` to
`DocsComponent`.

```typescript fileName="docs.component.ts"
import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-docs',
	template: `
		<ng-doc-root>
			<ng-doc-navbar [leftContent]="leftContent">
				<ng-template #leftContent>
					<h3 style="margin: 0">MyAwesomeDoc</h3>
				</ng-template>
			</ng-doc-navbar>
			<ng-doc-sidebar></ng-doc-sidebar>
			<router-outlet></router-outlet>
		</ng-doc-root>
	`,
	styleUrls: ['./docs.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {}
```

### Routing in AppModule

Now you need to add lazy loading for DocsModule and set a route for it

```typescript fileName="app.module.ts"
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {RouterModule} from '@angular/router';

import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		RouterModule.forRoot([
			{
				path: 'docs',
				loadChildren: () => import('./docs/docs.module').then((m: typeof import('./docs/docs.module')) => m.DocsModule),
			},
		]),
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
```

### Configure NgDoc route prefix

NgDoc generates links automatically, and doesn't know what route the parent page will have, so you
need to specify the `routePrefix` property in `ng-doc.config.ts` file.

```typescript fileName="ng-doc.config.ts"
import {NgDocConfiguration} from '@ng-doc/builder';

const config: NgDocConfiguration = {
	routePrefix: 'docs',
};

export default config;
```

That's it, now you should be able to see your documentation on new route!
