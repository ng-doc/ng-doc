# Here will be demo

Here you will se how easy it's to create some demo with NgDoc. <div>Some text</div>

## Playground

{{ NgDocActions.playground("playground1") }}

## Tag playground

{{ NgDocActions.playground("playground2") }}

## Inline demo

```scss
:host {
	display: flex;
	align-items: center;
	height: 100%;
	width: 100%;
	padding: 0 calc(var(--ng-doc-base-gutter) * 5);
  box-shadow: 0 4px 4px var(--ng-doc-border-color);

  .ng-doc-navbar-brand {
    font-weight: bold;
    font-size: 16px;
  }
}
```

{{ NgDocActions.demo("InlineDemoComponent", {container: false}) }}

## Multi file demo

```scss
:host {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
  padding: 0 calc(var(--ng-doc-base-gutter) * 5);
  box-shadow: 0 4px 4px var(--ng-doc-border-color);

  .ng-doc-navbar-brand {
    font-weight: bold;
    font-size: 16px;
  }
}
```

{{ NgDocActions.demo("DemoWithFilesComponent") }}

```typescript
export class Test {
	test: string = 'test';
}
```

## API

{{ NgDocActions.api("../class.ts#TestClass") }}

{{ NgDocActions.api("../class.ts#MyEnum1") }}

{{ NgDocActions.api("../class.ts#MyInterface") }}

{{ NgDocActions.api("../class.ts#MyType") }}

{{ NgDocActions.api("../class.ts#myFunction") }}
