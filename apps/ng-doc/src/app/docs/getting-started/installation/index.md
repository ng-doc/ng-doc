# {{ NgDocPage.title }}

## Automatic (recommended)

To install the NgDoc, you can use the command above.
This command will automatically install and add the library to your project.

```bash
ng add @ng-doc/add
```

## Manual

Install the NgDoc via your package manage

```bash
npm i @ng-doc/{core,builder,ui-kit,app}
```

### Adding builders

First of all you need to add builders from NgDoc library to your application, open `angular.json`
file, and replace `browser` and `dev-server` builders for `build` and `serve` targets with
alternatives
from the NgDoc as shown in the example below

```json
{
	"projects": {
		"my-project": {
			"architect": {
				"build": {
					"builder": "@ng-doc/builder:browser"
				}
			},
			"serve": {
				"builder": "@ng-doc/builder:dev-server"
			}
		}
	}
}
```

### Importing styles

You will also need to import the global styles provided by the library.
To do that edit you `angular.json` file, or add them to you `styles` file

```json
{
	"projects": {
		"my-project": {
			"architect": {
				"build": {
					"options": {
						"styles": ["@ng-doc/app/styles/global.scss"]
					}
				}
			}
		}
	}
}
```

### Adding assets

The NgDoc libraries come with assets that include various icons, fonts, themes, and other very
useful things. You also need to include them, for this add the following code to your `angular.json`
file.

```json
{
	"projects": {
		"my-project": {
			"architect": {
				"build": {
					"options": {
						"assets": [
							{
								"glob": "**/*",
								"input": "./node_modules/@ng-doc/ui-kit/assets",
								"output": "assets"
							},
							{
								"glob": "**/*",
								"input": "./node_modules/@ng-doc/app/assets",
								"output": "assets"
							},
							{
								"glob": "**/*",
								"input": "./node_modules/@ng-doc/builder/generated/assets",
								"output": "assets"
							}
						]
					}
				}
			}
		}
	}
}
```

### Importing global modules

Import the global library-provided modules into your application's root `AppModule`

```typescript
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocModule} from '@ng-doc/app';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/builder/generated';
import {NgDocUiKitRootModule} from '@ng-doc/ui-kit';

import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		// To enable animations ( import NoopAnimationsModule if you don't like animations :( )
		BrowserAnimationsModule,
		// Root NgDoc module
		NgDocModule.forRoot(),
		// Root NgDoc ui-kit module
		NgDocUiKitRootModule.forRoot(),
		// Generated module that contains all generated pages
		NgDocGeneratedModule.forRoot(),
		// Add generated routes
		RouterModule.forRoot(NG_DOC_ROUTING),
	],
	providers: [],
	bootstrap: [AppComponent],
})
export class AppModule {}
```

### Adding application layout

You will also need to add an application layer to your root `AppComponent` to display header and
menu, to do this open your `app.component.html` file and add the following code to it

```html
<ng-doc-root>
	<ng-doc-navbar [leftContent]="leftContent">
		<ng-template #leftContent>
			<h3 class="brand" style="margin: 0">MyDocs</h3>
		</ng-template>
	</ng-doc-navbar>
	<ng-doc-sidebar></ng-doc-sidebar>
	<router-outlet></router-outlet>
</ng-doc-root>
```
