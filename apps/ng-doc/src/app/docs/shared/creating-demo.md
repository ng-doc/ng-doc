## Creating a demo

First of all, in order to display the demo on the page, you need the `ng-doc.dependencies.ts`
file as well as the `NgModule`, you can read about how to create them in the `*EntitiesDependencies`
article.

Please make sure your demo is declarated in your page module and registered in the `ng-doc.dependencies.ts` file
before you continue.


### Declaring in NgModule

After that make sure your component is declared in the `declaration` section of
your `NgModule`, and all its dependencies are imported in the `imports` section.

```typescript file="./ng-doc.module.ts" fileName="ng-doc.module.ts"

```

### Adding module and demo to dependencies file

And the last step is to add your demo to the `ng-doc.dependencies.ts` file, in the `demos` section,
this is necessary so that NgDoc knows which components it should consider as a demo, and what their
name is, this can be done simply list them separated by commas.

```typescript file="./ng-doc.dependencies.ts" fileName="ng-doc.dependencies.ts"

```
