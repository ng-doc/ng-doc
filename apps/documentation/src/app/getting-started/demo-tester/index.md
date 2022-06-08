# Here will be demo

Here you will se how easy it's to create some demo with NgDoc.

## Inline demo

```scss
:host {
	display: flex;
	align-items: center;
	height: 100%;
	width: 100%;
	padding: 0 calc(var(--ng-doc-base-gutter) * 5);
	box-shadow: 0 4px 4px var(--ng-doc-border-color);

	.ng-doc-header-brand {
		font-weight: bold;
		font-size: 16px;
	}
}
```

{{ ngDocActions.demo("InlineDemoComponent") }}

## Multi file demo

```scss
:host {
	display: flex;
	align-items: center;
	height: 100%;
	width: 100%;
	padding: 0 calc(var(--ng-doc-base-gutter) * 5);
	box-shadow: 0 4px 4px var(--ng-doc-border-color);

	.ng-doc-header-brand {
		font-weight: bold;
		font-size: 16px;
	}
}
```

{{ ngDocActions.demo("DemoWithFilesComponent") }}

```typescript
export class Test {
	test: string = 'test';
}
```


# API

{{ ngDocActions.api("../class.ts#TestClass") }}
