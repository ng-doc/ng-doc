# {{ NgDocPage.title }}

```typescript file="./ng-doc.page.ts"#L3-L6 fileName="ng-doc.page.ts" lineNumbers

```

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
								"input": "node_modules/@ng-doc/ui-kit/assets",
								"output": "assets"
							},
							{
								"glob": "**/*",
								"input": "node_modules/@ng-doc/app/assets",
								"output": "assets"
							},
							{
								"glob": "**/*",
								"input": ".ng-doc/docs/assets",
								"output": "assets/ng-doc"
							}
						]
					}
				}
			}
		}
	}
}
```
