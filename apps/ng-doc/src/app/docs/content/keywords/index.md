# {{ NgDocPage.title }}

Keywords allow you not to tie your documentation to certain links, as well as make it more dynamic,
as a result, mentions of certain entities or pages will turn into links automatically.

## Auto-Generated keywords

NgDoc automatically generates keywords for all declarations specified in `ng-doc.api.ts` (
see `EntitiesAPI` for how to create it), for example, if you have a class declaration that's called
`MyAwesomeClass`, NgDoc generates keyword `MyAwesomeClass` for it, this means that if you decide to
mention this class as inline code or block code, NgDoc will automatically create a link to the API
page of this declaration.

For example here is the block code, that uses one of types from our Ui-Kit.

```typescript
import {NgDocSize} from './size';

const size: NgDocSize = 'small';
```

## Page keywords

You can also use this functionality to create links to other pages, so if you decide to move a page
from one category to another, you don't have to search the documentation for paths that no longer
work.

> **Note**
> To turn a page keyword into a link, use the inline code in which you specify the keyword

To do that, specify your preferred keyword in your page configuration in the `keyword` field.

```typescript
import {NgDocPage} from '@ng-doc/builder';

export const MyAwesomePage: NgDocPage = {
	title: 'My Awesome Page',
	mdFile: './index.md',
	// This keyword can be used to create a link to the page
	// (e.g. like that `MyCustomKeyword`)
	keyword: `MyCustomKeyword`,
}

export default MyAwesomePage;
```

## Global keywords

Sometimes it is necessary to create links to third-party documentation or just to other sites,
to create such links you can use global keywords that can be declared in the configuration for your
builder in the `angular.json` file and must conform to the `NgDocGlobalKeyword` interface.

```json

{
	"projects": {
		"my-project": {
			"architect": {
				"serve": {
					"builder": "@ng-doc/builder:dev-server",
					"options": {
						"ngDoc": {
							"keywords": {
								"google": {
									"path": "https://google.com/"
								}
							}
						}
					}
				}
			}
		}
	}
```
